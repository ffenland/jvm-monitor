# Brother b-PAC 설치 복구 스크립트
# 관리자 권한으로 실행해야 함

param(
    [switch]$Force = $false
)

# 관리자 권한 확인
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script requires Administrator privileges." -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "Brother b-PAC Registration Fix" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

# b-PAC SDK 설치 경로 확인
$bpacPath = "C:\Program Files (x86)\Brother bPAC3 SDK"
if (-not (Test-Path $bpacPath)) {
    Write-Host "Brother b-PAC3 SDK not found at: $bpacPath" -ForegroundColor Red
    exit 1
}

Write-Host "Found b-PAC SDK at: $bpacPath" -ForegroundColor Green

# 핵심 DLL 파일 찾기
$coreDlls = @(
    "$bpacPath\bpac.dll",
    "$bpacPath\b-PAC3.dll",
    "$bpacPath\BrssCom.dll"
)

# System32 및 SysWOW64에서 b-PAC DLL 찾기
$system32Path = "$env:WINDIR\System32"
$syswow64Path = "$env:WINDIR\SysWOW64"

$systemDlls = @()
$systemDlls += Get-ChildItem -Path $system32Path -Filter "*bpac*.dll" -ErrorAction SilentlyContinue
$systemDlls += Get-ChildItem -Path $syswow64Path -Filter "*bpac*.dll" -ErrorAction SilentlyContinue

if ($systemDlls.Count -gt 0) {
    Write-Host "`nFound b-PAC DLLs in system directories:" -ForegroundColor Yellow
    foreach ($dll in $systemDlls) {
        Write-Host "  - $($dll.FullName)" -ForegroundColor Gray
    }
} else {
    Write-Host "`nNo b-PAC DLLs found in system directories." -ForegroundColor Yellow
    Write-Host "This might be the cause of the registration problem." -ForegroundColor Yellow
}

# Brother b-PAC 재설치 제안
Write-Host "`n" -NoNewline
Write-Host "RECOMMENDED SOLUTION:" -ForegroundColor Green
Write-Host "===================" -ForegroundColor Green
Write-Host "1. Uninstall Brother b-PAC3 SDK from Control Panel" -ForegroundColor White
Write-Host "2. Restart your computer" -ForegroundColor White
Write-Host "3. Download and reinstall Brother b-PAC3 SDK from:" -ForegroundColor White
Write-Host "   https://support.brother.com/g/s/es/dev/en/bpac/download/index.html" -ForegroundColor Cyan
Write-Host "4. During installation, make sure to:" -ForegroundColor White
Write-Host "   - Run installer as Administrator" -ForegroundColor Yellow
Write-Host "   - Select 'Complete' installation" -ForegroundColor Yellow
Write-Host "   - Allow COM registration when prompted" -ForegroundColor Yellow

# 대체 솔루션: 수동 등록 시도
if ($Force) {
    Write-Host "`nAttempting manual registration..." -ForegroundColor Yellow
    
    # b-PAC 설치 디렉토리의 모든 실행 파일 찾기
    $installers = Get-ChildItem -Path $bpacPath -Filter "*.exe" -Recurse | Where-Object {
        $_.Name -match "setup" -or $_.Name -match "install" -or $_.Name -match "regist"
    }
    
    if ($installers.Count -gt 0) {
        Write-Host "Found installer/registration tools:" -ForegroundColor Cyan
        foreach ($installer in $installers) {
            Write-Host "  - $($installer.FullName)" -ForegroundColor Gray
        }
    }
}

# COM 객체 테스트
Write-Host "`nTesting COM object creation..." -ForegroundColor Cyan

# 32비트 PowerShell로 테스트
$test32Script = @'
try {
    $bpac = New-Object -ComObject "bpac.Document"
    if ($bpac -ne $null) {
        Write-Host "SUCCESS: COM object created in 32-bit mode" -ForegroundColor Green
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    }
} catch {
    Write-Host "FAILED: 32-bit mode - $_" -ForegroundColor Red
}
'@

$ps32Path = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if (Test-Path $ps32Path) {
    Write-Host "Testing with 32-bit PowerShell..." -ForegroundColor Yellow
    & $ps32Path -Command $test32Script
} else {
    Write-Host "32-bit PowerShell not found" -ForegroundColor Red
}

Write-Host "`nDone." -ForegroundColor Cyan