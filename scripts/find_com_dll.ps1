param()

$result = @{
    comDlls = @()
    registryPaths = @()
    recommendations = @()
}

try {
    # b-PAC COM 클래스들의 CLSID 찾기
    $bpacClasses = @("bpac.Document", "bpac.Object", "bpac.Objects", "bpac.Printer")
    
    foreach ($className in $bpacClasses) {
        $paths = @(
            "HKLM:\SOFTWARE\Classes\$className\CLSID",
            "HKLM:\SOFTWARE\WOW6432Node\Classes\$className\CLSID"
        )
        
        foreach ($path in $paths) {
            try {
                if (Test-Path $path) {
                    $clsid = (Get-ItemProperty $path -ErrorAction SilentlyContinue).'(default)'
                    if ($clsid) {
                        $result.registryPaths += @{
                            class = $className
                            path = $path
                            clsid = $clsid
                        }
                        
                        # CLSID로 DLL 위치 찾기
                        $clsidPaths = @(
                            "HKLM:\SOFTWARE\Classes\CLSID\$clsid\InprocServer32",
                            "HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\$clsid\InprocServer32"
                        )
                        
                        foreach ($clsidPath in $clsidPaths) {
                            try {
                                if (Test-Path $clsidPath) {
                                    $dllPath = (Get-ItemProperty $clsidPath -ErrorAction SilentlyContinue).'(default)'
                                    if ($dllPath -and (Test-Path $dllPath)) {
                                        $result.comDlls += @{
                                            class = $className
                                            clsid = $clsid
                                            dllPath = $dllPath
                                            registryPath = $clsidPath
                                            exists = (Test-Path $dllPath)
                                        }
                                    }
                                }
                            } catch {
                                # 무시
                            }
                        }
                    }
                }
            } catch {
                # 무시
            }
        }
    }
    
    # 시스템에서 b-PAC 관련 DLL 검색
    $searchPaths = @(
        "C:\Windows\System32",
        "C:\Windows\SysWOW64",
        "C:\Program Files\Brother",
        "C:\Program Files (x86)\Brother"
    )
    
    foreach ($searchPath in $searchPaths) {
        try {
            if (Test-Path $searchPath) {
                $dlls = Get-ChildItem -Path $searchPath -Recurse -Filter "*bpac*.dll" -ErrorAction SilentlyContinue
                foreach ($dll in $dlls) {
                    $result.comDlls += @{
                        class = "Found by search"
                        clsid = "N/A"
                        dllPath = $dll.FullName
                        registryPath = "N/A"
                        exists = $true
                        size = $dll.Length
                        version = try { (Get-ItemProperty $dll.FullName).VersionInfo.FileVersion } catch { "Unknown" }
                    }
                }
            }
        } catch {
            # 무시
        }
    }
    
    # 권장사항 생성
    if ($result.comDlls.Count -gt 0) {
        $result.recommendations += "Found COM DLL files:"
        foreach ($dll in $result.comDlls) {
            if ($dll.exists) {
                $result.recommendations += "Try: regsvr32 `"$($dll.dllPath)`""
            } else {
                $result.recommendations += "Missing DLL: $($dll.dllPath)"
            }
        }
    } else {
        $result.recommendations += "No b-PAC COM DLLs found."
        $result.recommendations += "Try reinstalling b-PAC3 SDK or Brother P-touch Editor."
    }
    
    # 기존 COM 객체 테스트
    $comNames = @("bpac.Document", "bpac.Object", "bpac.Objects", "bpac.Printer")
    foreach ($comName in $comNames) {
        try {
            $obj = New-Object -ComObject $comName
            if ($obj -ne $null) {
                $result.recommendations += "SUCCESS: COM object '$comName' is working!"
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
            }
        } catch {
            $result.recommendations += "FAILED: COM object '$comName' - $($_.Exception.Message)"
        }
    }
    
} catch {
    $result.recommendations += "Error occurred: $($_.Exception.Message)"
}

Write-Output ($result | ConvertTo-Json -Depth 4 -Compress)