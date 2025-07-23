# b-PAC DLL 찾기 및 등록 스크립트
param()

Write-Host "=== b-PAC DLL Search and Registration ===" -ForegroundColor Cyan
Write-Host ""

# 관리자 권한 확인
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "WARNING: Not running as Administrator. Registration may fail." -ForegroundColor Yellow
    Write-Host ""
}

# Brother 관련 프로그램 설치 경로들
$searchPaths = @(
    "C:\Program Files (x86)\Brother bPAC3 SDK",
    "C:\Program Files (x86)\Brother\Ptedit54",
    "C:\Program Files (x86)\Brother\PtUpdate",
    "C:\Program Files\Brother",
    "C:\Program Files (x86)\Brother",
    "C:\Windows\System32",
    "C:\Windows\SysWOW64"
)

Write-Host "Searching for b-PAC related DLL files..." -ForegroundColor Yellow

$foundDlls = @()

foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        Write-Host "Searching in: $path" -ForegroundColor Gray
        
        # b-PAC 관련 DLL 찾기
        $dlls = Get-ChildItem -Path $path -Filter "*.dll" -Recurse -ErrorAction SilentlyContinue | 
                Where-Object { $_.Name -match "bpac|brsc|brother" -and $_.Name -notmatch "printer" }
        
        foreach ($dll in $dlls) {
            $foundDlls += $dll
            Write-Host "  Found: $($dll.FullName)" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "Total DLLs found: $($foundDlls.Count)" -ForegroundColor Yellow
Write-Host ""

# 특정 DLL 찾기
$targetDlls = @("bpac.dll", "BrssCom.dll", "Brother.bpac.dll", "bpac3.dll")
$registrationCandidates = @()

foreach ($target in $targetDlls) {
    $found = $foundDlls | Where-Object { $_.Name -eq $target }
    if ($found) {
        Write-Host "Found target DLL: $($found.FullName)" -ForegroundColor Green
        $registrationCandidates += $found
    }
}

# COM 서버로 등록 가능한 DLL 확인
Write-Host ""
Write-Host "Checking for COM registration..." -ForegroundColor Yellow

foreach ($dll in $registrationCandidates) {
    Write-Host ""
    Write-Host "Checking: $($dll.Name)" -ForegroundColor Cyan
    
    # DLL 정보 확인
    try {
        $fileInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($dll.FullName)
        Write-Host "  Version: $($fileInfo.FileVersion)" -ForegroundColor Gray
        Write-Host "  Company: $($fileInfo.CompanyName)" -ForegroundColor Gray
        Write-Host "  Description: $($fileInfo.FileDescription)" -ForegroundColor Gray
    } catch {
        Write-Host "  Could not get file info" -ForegroundColor Red
    }
    
    # DLL에서 DllRegisterServer export 확인
    try {
        $exports = & "C:\Windows\System32\dumpbin.exe" /exports "$($dll.FullName)" 2>$null
        if ($exports -match "DllRegisterServer") {
            Write-Host "  COM Registration: SUPPORTED" -ForegroundColor Green
            
            if ($isAdmin) {
                Write-Host "  Attempting registration..." -ForegroundColor Yellow
                $regsvr32 = "C:\Windows\SysWOW64\regsvr32.exe"
                $process = Start-Process -FilePath $regsvr32 -ArgumentList "/s", "`"$($dll.FullName)`"" -Wait -PassThru -WindowStyle Hidden
                
                if ($process.ExitCode -eq 0) {
                    Write-Host "  Registration: SUCCESS" -ForegroundColor Green
                } else {
                    Write-Host "  Registration: FAILED (Exit code: $($process.ExitCode))" -ForegroundColor Red
                }
            } else {
                Write-Host "  Registration: SKIPPED (Need Administrator rights)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  COM Registration: NOT SUPPORTED" -ForegroundColor Red
        }
    } catch {
        # dumpbin이 없을 수 있으므로 대체 방법
        if ($isAdmin) {
            Write-Host "  Trying direct registration..." -ForegroundColor Yellow
            try {
                $regsvr32 = "C:\Windows\SysWOW64\regsvr32.exe"
                $process = Start-Process -FilePath $regsvr32 -ArgumentList "/s", "`"$($dll.FullName)`"" -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop
                
                if ($process.ExitCode -eq 0) {
                    Write-Host "  Registration: SUCCESS" -ForegroundColor Green
                } else {
                    Write-Host "  Registration: FAILED" -ForegroundColor Red
                }
            } catch {
                Write-Host "  Registration: ERROR - $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

# Brother P-touch Editor 설치 경로에서 추가 확인
Write-Host ""
Write-Host "Checking P-touch Editor installation..." -ForegroundColor Yellow

$ptouchPath = "C:\Program Files (x86)\Brother\Ptedit54"
if (Test-Path $ptouchPath) {
    $ptouchExe = Join-Path $ptouchPath "Ptedit5.exe"
    if (Test-Path $ptouchExe) {
        Write-Host "P-touch Editor found at: $ptouchExe" -ForegroundColor Green
        
        # 같은 폴더에 b-PAC 관련 DLL이 있는지 확인
        $ptouchDlls = Get-ChildItem -Path $ptouchPath -Filter "*.dll" | Where-Object { $_.Name -match "bpac|brsc" }
        foreach ($dll in $ptouchDlls) {
            Write-Host "  Related DLL: $($dll.Name)" -ForegroundColor Gray
        }
    }
}

Write-Host ""
Write-Host "Registration complete." -ForegroundColor Green
Write-Host ""
Write-Host "Testing COM object creation..." -ForegroundColor Yellow

# COM 객체 테스트
$comNames = @("bpac.Document", "BrssCom.Document")
$success = $false

foreach ($com in $comNames) {
    Write-Host -NoNewline "  Testing $com... "
    try {
        $obj = New-Object -ComObject $com
        if ($obj -ne $null) {
            Write-Host "SUCCESS" -ForegroundColor Green
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
            $success = $true
            break
        }
    } catch {
        Write-Host "FAILED" -ForegroundColor Red
    }
}

if (-not $success) {
    Write-Host ""
    Write-Host "COM object still not working." -ForegroundColor Red
    Write-Host "Please try:" -ForegroundColor Yellow
    Write-Host "1. Run this script as Administrator" -ForegroundColor Gray
    Write-Host "2. Reinstall Brother b-PAC3 SDK" -ForegroundColor Gray
    Write-Host "3. Install Brother P-touch Editor (includes b-PAC)" -ForegroundColor Gray
}