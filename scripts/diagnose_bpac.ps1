param()

$result = @{
    bpacAvailable = $false
    comObjectCreated = $false
    registryFound = $false
    installPath = ""
    errorMessage = ""
    systemInfo = @{
        is64Bit = [Environment]::Is64BitOperatingSystem
        is64BitProcess = [Environment]::Is64BitProcess
        osVersion = [Environment]::OSVersion.VersionString
        powershellVersion = $PSVersionTable.PSVersion.ToString()
    }
    installedSoftware = @()
    registryKeys = @()
}

try {
    # 1. 설치된 소프트웨어 확인 (디버그 메시지 제거)
    
    # 32비트 및 64비트 레지스트리 경로 확인
    $registryPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    
    foreach ($path in $registryPaths) {
        try {
            $installed = Get-ItemProperty $path -ErrorAction SilentlyContinue | 
                Where-Object { $_.DisplayName -like "*Brother*" -or $_.DisplayName -like "*b-PAC*" -or $_.DisplayName -like "*P-touch*" }
            
            foreach ($item in $installed) {
                $result.installedSoftware += @{
                    name = $item.DisplayName
                    version = $item.DisplayVersion
                    installLocation = $item.InstallLocation
                    publisher = $item.Publisher
                }
            }
        } catch {
            # 레지스트리 경로가 없을 수 있음
        }
    }
    
    # 2. B-PAC 레지스트리 키 확인
    
    $bpacRegistryPaths = @(
        "HKLM:\SOFTWARE\Classes\bpac.Document",
        "HKLM:\SOFTWARE\WOW6432Node\Classes\bpac.Document",
        "HKCR:\bpac.Document",
        "HKLM:\SOFTWARE\Classes\CLSID\{B940C105-7F01-46FE-BF41-E86C1B3FA2AC}",
        "HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\{B940C105-7F01-46FE-BF41-E86C1B3FA2AC}"
    )
    
    foreach ($regPath in $bpacRegistryPaths) {
        try {
            if (Test-Path $regPath) {
                $regInfo = Get-ItemProperty $regPath -ErrorAction SilentlyContinue
                $result.registryKeys += @{
                    path = $regPath
                    exists = $true
                    values = $regInfo
                }
                $result.registryFound = $true
            } else {
                $result.registryKeys += @{
                    path = $regPath
                    exists = $false
                }
            }
        } catch {
            $result.registryKeys += @{
                path = $regPath
                exists = $false
                error = $_.Exception.Message
            }
        }
    }
    
    # 3. COM 객체 생성 시도 (b-PAC3)
    
    try {
        $bpac = New-Object -ComObject "bpac3.Document"
        if ($bpac -ne $null) {
            $result.comObjectCreated = $true
            $result.bpacAvailable = $true
            
            # 추가 정보 수집
            try {
                $version = $bpac.Version
                $result.version = $version
            } catch {
                $result.version = "Unknown"
            }
            
            # COM 객체 해제
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
            $bpac = $null
        }
    } catch {
        $result.errorMessage = $_.Exception.Message
        $result.comObjectCreated = $false
    }
    
    # 4. 일반적인 B-PAC 설치 경로 확인
    $commonPaths = @(
        "C:\Program Files\Brother\b-PAC SDK",
        "C:\Program Files (x86)\Brother\b-PAC SDK",
        "C:\Program Files\Brother bLabel&P-touch",
        "C:\Program Files (x86)\Brother bLabel&P-touch",
        "C:\Program Files (x86)\Brother bPAC3 SDK"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $result.installPath = $path
            break
        }
    }
    
} catch {
    $result.errorMessage = "General error: " + $_.Exception.Message
}

# 결과 출력 (Write-Host 대신 Write-Output만 사용)
Write-Output ($result | ConvertTo-Json -Depth 4 -Compress)