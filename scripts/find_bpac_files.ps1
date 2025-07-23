param()

$result = @{
    sdkPath = ""
    dllFiles = @()
    exeFiles = @()
    registryEntries = @()
    recommendations = @()
}

try {
    # 1. b-PAC3 SDK 설치 디렉토리 찾기
    $searchPaths = @(
        "C:\Program Files (x86)\Brother bPAC3 SDK",
        "C:\Program Files\Brother bPAC3 SDK",
        "C:\Program Files (x86)\Brother\bPAC3 SDK",
        "C:\Program Files\Brother\bPAC3 SDK"
    )
    
    foreach ($path in $searchPaths) {
        if (Test-Path $path) {
            $result.sdkPath = $path
            break
        }
    }
    
    if ($result.sdkPath -ne "") {
        # 2. DLL 파일들 찾기
        $dllFiles = Get-ChildItem -Path $result.sdkPath -Recurse -Filter "*.dll" -ErrorAction SilentlyContinue
        foreach ($dll in $dllFiles) {
            $result.dllFiles += @{
                name = $dll.Name
                fullPath = $dll.FullName
                size = $dll.Length
                version = try { (Get-ItemProperty $dll.FullName).VersionInfo.FileVersion } catch { "Unknown" }
            }
        }
        
        # 3. EXE 파일들 찾기
        $exeFiles = Get-ChildItem -Path $result.sdkPath -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue
        foreach ($exe in $exeFiles) {
            $result.exeFiles += @{
                name = $exe.Name
                fullPath = $exe.FullName
                size = $exe.Length
                version = try { (Get-ItemProperty $exe.FullName).VersionInfo.FileVersion } catch { "Unknown" }
            }
        }
    }
    
    # 4. 레지스트리에서 b-PAC 관련 항목 찾기
    $regPaths = @(
        "HKLM:\SOFTWARE\Classes",
        "HKLM:\SOFTWARE\WOW6432Node\Classes"
    )
    
    foreach ($regPath in $regPaths) {
        try {
            $keys = Get-ChildItem $regPath -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "bpac|brother" }
            foreach ($key in $keys) {
                $result.registryEntries += @{
                    path = $key.Name
                    name = $key.PSChildName
                }
            }
        } catch {
            # 무시
        }
    }
    
    # 5. COM 객체 등록 상태 확인
    $comGuids = @(
        "BrotherLab30.Document",
        "bpac3.Document", 
        "BrotherbPAC30.Document"
    )
    
    foreach ($guid in $comGuids) {
        try {
            $obj = New-Object -ComObject $guid
            if ($obj -ne $null) {
                $result.recommendations += "COM object '$guid' is working"
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
            }
        } catch {
            $result.recommendations += "COM object '$guid' failed: $($_.Exception.Message)"
        }
    }
    
    # 6. 권장사항 생성
    if ($result.dllFiles.Count -gt 0) {
        $result.recommendations += "Found DLL files in: $($result.sdkPath)"
        foreach ($dll in $result.dllFiles) {
            if ($dll.name -match "bpac|brother") {
                $result.recommendations += "Try: regsvr32 `"$($dll.fullPath)`""
            }
        }
    } else {
        $result.recommendations += "No DLL files found. b-PAC3 SDK may not be properly installed."
        $result.recommendations += "Download and reinstall b-PAC3 SDK from Brother website."
    }
    
} catch {
    $result.recommendations += "Error occurred: $($_.Exception.Message)"
}

Write-Output ($result | ConvertTo-Json -Depth 4 -Compress)