# b-PAC SDK 사용 가능 여부 확인
try {
    $bpac = $null
    # Brother 공식 문서에 따른 COM 객체 이름들 (버전별)
    $comNames = @(
        "bpac.Document",      # b-PAC SDK 3.0
        "b-PAC.Document",     # 이전 버전 호환
        "bpac3.Document",     # b-PAC SDK 3.1 이상
        "Brother.bpac.Document", # 일부 버전
        "BrssCom.Document"    # 매우 오래된 버전
    )
    
    $successfulCom = ""
    
    foreach ($com in $comNames) {
        try {
            # COM 객체 생성 시도
            $bpac = New-Object -ComObject $com
            if ($bpac -ne $null) {
                $successfulCom = $com
                
                # 버전 정보 가져오기 시도
                $version = "Unknown"
                try {
                    $version = $bpac.Version
                } catch {
                    # 버전 정보 없을 수 있음
                }
                
                # COM 객체 해제
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
                $bpac = $null
                
                $result = @{
                    error = $false
                    message = "b-PAC SDK is available"
                    comObject = $successfulCom
                    version = $version
                }
                Write-Output ($result | ConvertTo-Json -Compress)
                exit 0
            }
        } catch {
            # 이 COM 객체는 사용할 수 없음, 다음 시도
            continue
        }
    }
    
    # 모든 COM 객체 생성 실패
    $result = @{
        error = $true
        message = "b-PAC SDK not found. Please install Brother b-PAC SDK."
        testedObjects = $comNames
    }
    Write-Output ($result | ConvertTo-Json -Compress)
    exit 1
}
catch {
    $result = @{
        error = $true
        message = "Error checking b-PAC: $($_.Exception.Message)"
    }
    Write-Output ($result | ConvertTo-Json -Compress)
    exit 1
}