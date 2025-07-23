# b-PAC COM 객체 수동 등록 스크립트
# 관리자 권한으로 실행해야 함

param()

# 관리자 권한 확인
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "=== b-PAC COM Registration ===" -ForegroundColor Cyan
Write-Host ""

# b-PAC SDK 설치 경로 찾기
$bpacPaths = @(
    "C:\Program Files (x86)\Brother bPAC3 SDK",
    "C:\Program Files\Brother bPAC3 SDK",
    "C:\Program Files (x86)\Brother\b-PAC SDK",
    "C:\Program Files\Brother\b-PAC SDK"
)

$bpacPath = ""
foreach ($path in $bpacPaths) {
    if (Test-Path $path) {
        $bpacPath = $path
        break
    }
}

if ($bpacPath -eq "") {
    Write-Host "b-PAC SDK installation not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Found b-PAC SDK at: $bpacPath" -ForegroundColor Green
Write-Host ""

# DLL 파일 찾기
$dllFiles = @(
    "BrssCom.dll",
    "bpac.dll",
    "Brother.bpac.dll"
)

$foundDlls = @()
foreach ($dll in $dllFiles) {
    $dllPath = Join-Path $bpacPath $dll
    if (Test-Path $dllPath) {
        $foundDlls += $dllPath
    } else {
        # bin 폴더에서도 찾기
        $dllPath = Join-Path $bpacPath "bin\$dll"
        if (Test-Path $dllPath) {
            $foundDlls += $dllPath
        }
    }
}

if ($foundDlls.Count -eq 0) {
    Write-Host "No b-PAC DLL files found!" -ForegroundColor Red
    exit 1
}

Write-Host "Found DLL files:" -ForegroundColor Yellow
foreach ($dll in $foundDlls) {
    Write-Host "  - $dll" -ForegroundColor Gray
}
Write-Host ""

# COM 객체 등록
Write-Host "Registering COM objects..." -ForegroundColor Yellow

foreach ($dll in $foundDlls) {
    Write-Host -NoNewline "  Registering $(Split-Path $dll -Leaf)... "
    
    try {
        # 32비트 regsvr32 사용 (b-PAC은 주로 32비트)
        $regsvr32 = "C:\Windows\SysWOW64\regsvr32.exe"
        
        $process = Start-Process -FilePath $regsvr32 -ArgumentList "/s", "`"$dll`"" -Wait -PassThru -WindowStyle Hidden
        
        if ($process.ExitCode -eq 0) {
            Write-Host "SUCCESS" -ForegroundColor Green
        } else {
            Write-Host "FAILED (Exit code: $($process.ExitCode))" -ForegroundColor Red
        }
    } catch {
        Write-Host "ERROR" -ForegroundColor Red
        Write-Host "    $($_.Exception.Message)" -ForegroundColor Gray
    }
}

Write-Host ""

# 등록 확인
Write-Host "Verifying registration..." -ForegroundColor Yellow
& "$PSScriptRoot\test_bpac_simple.ps1"