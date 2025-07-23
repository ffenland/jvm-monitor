# Brother b-PAC 템플릿 필드 확인 스크립트
param(
    [string]$templatePath
)

try {
    # UTF-8 인코딩 설정
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    
    # B-PAC COM 객체 생성
    $bpac = $null
    $comNames = @("bpac.Document", "b-PAC.Document", "bpac3.Document")
    
    foreach ($com in $comNames) {
        try {
            $bpac = New-Object -ComObject $com
            if ($bpac -ne $null) {
                # Write-Host "Created COM object: $com"
                break
            }
        } catch {
            continue
        }
    }
    
    if ($bpac -eq $null) {
        $result = @{
            error = $true
            message = "b-PAC COM object could not be created"
            fields = @()
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        exit 1
    }
    
    # 템플릿 열기
    $openResult = $bpac.Open($templatePath)
    if (-not $openResult) {
        $result = @{
            error = $true
            message = "Failed to open template file: $templatePath"
            fields = @()
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        exit 1
    }
    
    # Write-Host "Template opened successfully"
    
    # 템플릿의 모든 객체 가져오기
    $fields = @()
    
    try {
        $objects = $bpac.Objects
        $count = $objects.Count
        # Write-Host "Found $count objects in template"
        
        for ($i = 0; $i -lt $count; $i++) {
            try {
                $obj = $objects.Item($i)
                if ($obj -ne $null) {
                    $objName = $obj.Name
                    $objType = $obj.Type
                    
                    # 텍스트 객체인 경우
                    if ($objType -eq 0) {  # 0 = Text object
                        $fields += @{
                            name = $objName
                            type = "Text"
                            value = $obj.Text
                        }
                        # Write-Host "Found text field: $objName (current value: $($obj.Text))"
                    }
                    
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                }
            } catch {
                # Write-Host "Error accessing object at index $i`: $_"
            }
        }
        
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($objects) | Out-Null
    } catch {
        # Write-Host "Error enumerating objects`: $_"
        
        # 대체 방법: 알려진 필드명 직접 확인
        $knownFields = @(
            "medicineName", "patientName", "dailyDose", "singleDose", 
            "prescriptionDays", "date", "pharmacyName", "medicine"
        )
        
        foreach ($fieldName in $knownFields) {
            try {
                $obj = $bpac.GetObject($fieldName)
                if ($obj -ne $null) {
                    $fields += @{
                        name = $fieldName
                        type = "Text"
                        value = $obj.Text
                    }
                    # Write-Host "Found field by name: $fieldName"
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                }
            } catch {}
        }
    }
    
    # 문서 닫기
    $bpac.Close()
    
    # COM 객체 해제
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    $bpac = $null
    
    $result = @{
        error = $false
        message = "Template fields retrieved successfully"
        fields = $fields
    }
    
    Write-Output ($result | ConvertTo-Json -Compress)
}
catch {
    $result = @{
        error = $true
        message = "Error checking template: $($_.Exception.Message)"
        fields = @()
    }
    Write-Output ($result | ConvertTo-Json -Compress)
    
    if ($bpac -ne $null) {
        try {
            $bpac.Close()
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
        } catch {}
    }
    
    exit 1
}