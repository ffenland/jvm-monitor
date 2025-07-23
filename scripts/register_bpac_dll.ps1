# b-PAC DLL 수동 등록 스크립트
param()

# 관리자 권한 확인
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run PowerShell as Administrator and execute:" -ForegroundColor Yellow
    Write-Host "  cd `"$PSScriptRoot\..\`"" -ForegroundColor Gray
    Write-Host "  .\scripts\register_bpac_dll.ps1" -ForegroundColor Gray
    exit 1
}

Write-Host "=== b-PAC DLL Registration ===" -ForegroundColor Cyan
Write-Host ""

$bpacDll = "C:\Program Files (x86)\Common Files\Brother\b-PAC\bpac.dll"

if (Test-Path $bpacDll) {
    Write-Host "Found b-PAC DLL at: $bpacDll" -ForegroundColor Green
    
    # DLL 정보 확인
    $fileInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($bpacDll)
    Write-Host "  Version: $($fileInfo.FileVersion)" -ForegroundColor Gray
    Write-Host "  Company: $($fileInfo.CompanyName)" -ForegroundColor Gray
    Write-Host ""
    
    # 32비트 regsvr32로 등록 (b-PAC은 32비트 COM)
    Write-Host "Registering with 32-bit regsvr32..." -ForegroundColor Yellow
    
    try {
        $regsvr32 = "C:\Windows\SysWOW64\regsvr32.exe"
        
        # 먼저 등록 해제 시도
        Write-Host "Unregistering existing registration..." -ForegroundColor Gray
        $unregProcess = Start-Process -FilePath $regsvr32 -ArgumentList "/u", "/s", "`"$bpacDll`"" -Wait -PassThru -WindowStyle Hidden
        
        # 새로 등록
        Write-Host "Registering DLL..." -ForegroundColor Yellow
        $regProcess = Start-Process -FilePath $regsvr32 -ArgumentList "/s", "`"$bpacDll`"" -Wait -PassThru -WindowStyle Hidden
        
        if ($regProcess.ExitCode -eq 0) {
            Write-Host "Registration SUCCESSFUL!" -ForegroundColor Green
        } else {
            Write-Host "Registration FAILED with exit code: $($regProcess.ExitCode)" -ForegroundColor Red
            
            # 에러 코드별 설명
            switch ($regProcess.ExitCode) {
                1 { Write-Host "  Error: Invalid argument" -ForegroundColor Red }
                2 { Write-Host "  Error: OleInitialize failed" -ForegroundColor Red }
                3 { Write-Host "  Error: LoadLibrary failed" -ForegroundColor Red }
                4 { Write-Host "  Error: GetProcAddress failed" -ForegroundColor Red }
                5 { Write-Host "  Error: DllRegisterServer or DllUnregisterServer failed" -ForegroundColor Red }
                default { Write-Host "  Error: Unknown error" -ForegroundColor Red }
            }
        }
    } catch {
        Write-Host "Registration ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
    
} else {
    Write-Host "b-PAC DLL not found at expected location!" -ForegroundColor Red
    Write-Host "Expected: $bpacDll" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Testing COM object creation..." -ForegroundColor Yellow

# 32비트 PowerShell에서 테스트
$testScript = @'
try {
    $obj = New-Object -ComObject "bpac.Document"
    if ($obj -ne $null) {
        Write-Host "SUCCESS: COM object created!" -ForegroundColor Green
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
        exit 0
    } else {
        Write-Host "FAILED: Null object" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "FAILED: $_" -ForegroundColor Red
    exit 1
}
'@

# 임시 스크립트 파일 생성
$tempScript = [System.IO.Path]::GetTempFileName() + ".ps1"
$testScript | Out-File -FilePath $tempScript -Encoding UTF8

# 32비트 PowerShell에서 실행
$ps32 = "C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
& $ps32 -ExecutionPolicy Bypass -File $tempScript

# 임시 파일 삭제
Remove-Item $tempScript -Force

Write-Host ""
Write-Host "Registration process complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Close all PowerShell windows" -ForegroundColor Gray
Write-Host "2. Restart your Electron application" -ForegroundColor Gray
Write-Host "3. The application should now be able to use b-PAC" -ForegroundColor Gray