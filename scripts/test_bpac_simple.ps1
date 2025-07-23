# 간단한 b-PAC 테스트 스크립트
param()

Write-Host "=== b-PAC SDK Test ===" -ForegroundColor Cyan
Write-Host ""

# 시스템 정보
Write-Host "System Information:" -ForegroundColor Yellow
Write-Host "  OS: $([Environment]::OSVersion.VersionString)"
Write-Host "  64-bit OS: $([Environment]::Is64BitOperatingSystem)"
Write-Host "  64-bit Process: $([Environment]::Is64BitProcess)"
Write-Host "  PowerShell Version: $($PSVersionTable.PSVersion)"
Write-Host ""

# COM 객체 테스트
Write-Host "Testing COM Objects:" -ForegroundColor Yellow
$comNames = @(
    "bpac.Document",
    "b-PAC.Document", 
    "bpac3.Document",
    "Brother.bpac.Document",
    "BrssCom.Document"
)

$success = $false
$workingCom = ""

foreach ($com in $comNames) {
    Write-Host -NoNewline "  Testing $com... "
    try {
        $bpac = New-Object -ComObject $com
        if ($bpac -ne $null) {
            Write-Host "SUCCESS" -ForegroundColor Green
            $workingCom = $com
            
            # 버전 정보 확인
            try {
                $version = $bpac.Version
                Write-Host "    Version: $version" -ForegroundColor Gray
            } catch {
                Write-Host "    Version: Unable to retrieve" -ForegroundColor Gray
            }
            
            # COM 객체 해제
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
            $success = $true
            break
        } else {
            Write-Host "FAILED (null object)" -ForegroundColor Red
        }
    } catch {
        Write-Host "FAILED" -ForegroundColor Red
        Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Gray
    }
}

Write-Host ""

# 레지스트리 확인
Write-Host "Checking Registry:" -ForegroundColor Yellow
$regPaths = @(
    "HKLM:\SOFTWARE\Classes\bpac.Document",
    "HKLM:\SOFTWARE\WOW6432Node\Classes\bpac.Document",
    "HKCR:\bpac.Document"
)

foreach ($path in $regPaths) {
    Write-Host -NoNewline "  $path... "
    if (Test-Path $path) {
        Write-Host "EXISTS" -ForegroundColor Green
    } else {
        Write-Host "NOT FOUND" -ForegroundColor Red
    }
}

Write-Host ""

# Brother 소프트웨어 설치 확인
Write-Host "Checking Installed Brother Software:" -ForegroundColor Yellow
$software = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
                            "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like "*Brother*" -or $_.DisplayName -like "*b-PAC*" }

if ($software) {
    foreach ($app in $software) {
        Write-Host "  - $($app.DisplayName) (Version: $($app.DisplayVersion))" -ForegroundColor Gray
        if ($app.InstallLocation) {
            Write-Host "    Install Location: $($app.InstallLocation)" -ForegroundColor DarkGray
        }
    }
} else {
    Write-Host "  No Brother software found in registry" -ForegroundColor Red
}

Write-Host ""

# 결론
Write-Host "Summary:" -ForegroundColor Yellow
if ($success) {
    Write-Host "  b-PAC SDK is available!" -ForegroundColor Green
    Write-Host "  Working COM Object: $workingCom" -ForegroundColor Green
} else {
    Write-Host "  b-PAC SDK is NOT available!" -ForegroundColor Red
    Write-Host "  Please install Brother b-PAC SDK from:" -ForegroundColor Yellow
    Write-Host "  https://support.brother.com/g/s/es/dev/en/bpac/download/index.html" -ForegroundColor Cyan
}