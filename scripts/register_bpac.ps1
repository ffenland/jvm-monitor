# Brother b-PAC COM 객체 등록 스크립트
# 관리자 권한으로 실행해야 함

param(
    [switch]$Unregister = $false
)

# 관리자 권한 확인
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script requires Administrator privileges." -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    exit 1
}

# b-PAC SDK 경로 찾기
$bpacPaths = @(
    "C:\Program Files (x86)\Brother bPAC3 SDK\",
    "C:\Program Files\Brother bPAC3 SDK\",
    "C:\Program Files (x86)\Brother\bPAC SDK\",
    "C:\Program Files\Brother\bPAC SDK\"
)

$bpacPath = ""
foreach ($path in $bpacPaths) {
    if (Test-Path $path) {
        $bpacPath = $path
        break
    }
}

if ($bpacPath -eq "") {
    Write-Host "Brother b-PAC SDK installation not found." -ForegroundColor Red
    Write-Host "Please install Brother b-PAC SDK first." -ForegroundColor Yellow
    exit 1
}

Write-Host "Found b-PAC SDK at: $bpacPath" -ForegroundColor Green

# DLL 파일 찾기
$dllFiles = @()
$dllFiles += Get-ChildItem -Path $bpacPath -Filter "*.dll" -Recurse | Where-Object { 
    $_.Name -match "bpac" -or $_.Name -match "b-pac"
}

if ($dllFiles.Count -eq 0) {
    Write-Host "No b-PAC DLL files found." -ForegroundColor Red
    exit 1
}

Write-Host "Found $($dllFiles.Count) DLL file(s)" -ForegroundColor Cyan

foreach ($dll in $dllFiles) {
    Write-Host "`nProcessing: $($dll.FullName)" -ForegroundColor Yellow
    
    try {
        if ($Unregister) {
            # COM 객체 등록 해제
            Write-Host "Unregistering..." -NoNewline
            $result = Start-Process -FilePath "regsvr32.exe" -ArgumentList "/u", "/s", "`"$($dll.FullName)`"" -Wait -PassThru
            if ($result.ExitCode -eq 0) {
                Write-Host " Success" -ForegroundColor Green
            } else {
                Write-Host " Failed (Exit code: $($result.ExitCode))" -ForegroundColor Red
            }
        } else {
            # COM 객체 등록
            Write-Host "Registering..." -NoNewline
            $result = Start-Process -FilePath "regsvr32.exe" -ArgumentList "/s", "`"$($dll.FullName)`"" -Wait -PassThru
            if ($result.ExitCode -eq 0) {
                Write-Host " Success" -ForegroundColor Green
            } else {
                Write-Host " Failed (Exit code: $($result.ExitCode))" -ForegroundColor Red
            }
        }
    } catch {
        Write-Host " Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 등록 확인
Write-Host "`nChecking registration..." -ForegroundColor Cyan
try {
    $bpac = New-Object -ComObject "bpac.Document"
    if ($bpac -ne $null) {
        Write-Host "b-PAC COM object is now available!" -ForegroundColor Green
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    }
} catch {
    Write-Host "b-PAC COM object is still not available." -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nDone." -ForegroundColor Cyan