# 수동 b-PAC 테스트 및 등록
param()

Write-Host "=== Manual b-PAC Test ===" -ForegroundColor Cyan
Write-Host ""

# 현재 등록된 COM 객체 확인
Write-Host "Checking registered COM objects in registry..." -ForegroundColor Yellow

# HKEY_CLASSES_ROOT에서 bpac 관련 항목 찾기
$regPaths = @(
    "HKLM:\SOFTWARE\Classes\bpac.Document",
    "HKLM:\SOFTWARE\Classes\bpac.Document.1", 
    "HKLM:\SOFTWARE\Classes\CLSID\{B940C105-7F01-46FE-BF41-E040B9BDA83D}",
    "HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\{B940C105-7F01-46FE-BF41-E040B9BDA83D}"
)

foreach ($path in $regPaths) {
    Write-Host -NoNewline "  Checking $path... "
    if (Test-Path $path) {
        Write-Host "EXISTS" -ForegroundColor Green
        
        # InprocServer32 확인
        $inprocPath = Join-Path $path "InprocServer32"
        if (Test-Path $inprocPath) {
            $dll = (Get-ItemProperty $inprocPath -Name "(default)" -ErrorAction SilentlyContinue)."(default)"
            if ($dll) {
                Write-Host "    DLL Path: $dll" -ForegroundColor Gray
                if (Test-Path $dll) {
                    Write-Host "    DLL Exists: YES" -ForegroundColor Green
                } else {
                    Write-Host "    DLL Exists: NO" -ForegroundColor Red
                }
            }
        }
    } else {
        Write-Host "NOT FOUND" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Attempting direct COM instantiation with different methods..." -ForegroundColor Yellow

# 다양한 방법으로 COM 객체 생성 시도
$methods = @(
    { New-Object -ComObject "bpac.Document" },
    { [System.Activator]::CreateInstance([System.Type]::GetTypeFromProgID("bpac.Document")) },
    { $obj = CreateObject("bpac.Document"); $obj }
)

$methodNames = @(
    "New-Object -ComObject",
    "System.Activator::CreateInstance",
    "CreateObject"
)

for ($i = 0; $i -lt $methods.Count; $i++) {
    Write-Host ""
    Write-Host "Method $($i+1): $($methodNames[$i])" -ForegroundColor Cyan
    try {
        $obj = & $methods[$i]
        if ($obj -ne $null) {
            Write-Host "  SUCCESS! Object created." -ForegroundColor Green
            
            # 객체 정보
            Write-Host "  Object Type: $($obj.GetType().FullName)" -ForegroundColor Gray
            
            # 메서드 확인
            try {
                $members = $obj | Get-Member -MemberType Method | Select-Object -First 5
                Write-Host "  Available Methods (first 5):" -ForegroundColor Gray
                foreach ($member in $members) {
                    Write-Host "    - $($member.Name)" -ForegroundColor DarkGray
                }
            } catch {}
            
            # COM 객체 해제
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
            break
        } else {
            Write-Host "  Failed: Null object" -ForegroundColor Red
        }
    } catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
        
        # HRESULT 확인
        if ($_.Exception.HResult) {
            $hresult = "0x{0:X}" -f $_.Exception.HResult
            Write-Host "  HRESULT: $hresult" -ForegroundColor Gray
        }
    }
}

# Brother P-touch Editor 프로세스 확인
Write-Host ""
Write-Host "Checking if P-touch Editor can be launched..." -ForegroundColor Yellow

$ptouchExe = "C:\Program Files (x86)\Brother\Ptedit54\Ptedit5.exe"
if (Test-Path $ptouchExe) {
    Write-Host "P-touch Editor found. This confirms Brother software is installed." -ForegroundColor Green
} else {
    Write-Host "P-touch Editor not found." -ForegroundColor Red
}

# 추천사항
Write-Host ""
Write-Host "=== Recommendations ===" -ForegroundColor Yellow
Write-Host "1. b-PAC SDK seems to be missing the actual COM DLL" -ForegroundColor White
Write-Host "2. Try downloading and installing the latest b-PAC SDK from Brother website" -ForegroundColor White
Write-Host "3. Or try using P-touch Editor's built-in b-PAC if available" -ForegroundColor White
Write-Host "4. Make sure to install the 32-bit version of b-PAC SDK" -ForegroundColor White