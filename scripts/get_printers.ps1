param()

try {
    # UTF-8 인코딩 설정
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    
    # 실제 설치된 Brother 프린터만 가져오기
    $printerList = @()
    
    # WMI를 통해 실제 설치된 프린터 목록 가져오기 (32비트 PowerShell에서)
    $installedPrinters = Get-WmiObject -Class Win32_Printer | Where-Object { 
        $_.Name -match "Brother" -and 
        $_.DeviceID -ne $null -and 
        $_.DriverName -ne $null
    }
    
    # 실제로 시스템에 설치되어 있는지 추가 확인
    foreach ($printer in $installedPrinters) {
        # 프린터가 null이 아니고 이름이 있으면 추가
        if ($printer -ne $null -and $printer.Name -ne $null -and $printer.Name -ne "") {
            $printerList += $printer.Name
        }
    }
    
    # Brother b-PAC COM 객체 확인
    $bpacAvailable = $false
    $comObject = ""
    
    try {
        # b-PAC COM 객체 생성 시도
        $bpac = New-Object -ComObject "bpac.Document"
        if ($bpac -ne $null) {
            $bpacAvailable = $true
            $comObject = "bpac.Document"
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
        }
    } catch {
        # COM 객체 생성 실패 - 무시
    }
    
    # 결과 생성
    if ($printerList.Count -eq 0) {
        # 실제 설치된 Brother 프린터가 없는 경우
        $result = @{
            error = $false
            message = "No Brother printers are installed on this system."
            data = @()
            workingComObject = $comObject
            bpacAvailable = $bpacAvailable
        }
    } else {
        # 설치된 프린터가 있는 경우
        $result = @{
            error = $false
            message = "Found $($printerList.Count) installed Brother printer(s)."
            data = $printerList
            workingComObject = $comObject
            bpacAvailable = $bpacAvailable
        }
    }
    
    # JSON으로 출력 (UTF-8)
    $json = $result | ConvertTo-Json -Compress
    [Console]::WriteLine($json)
}
catch {
    $result = @{
        error = $true
        message = "Error getting Brother printers: $($_.Exception.Message)"
        data = @()
        workingComObject = ""
        bpacAvailable = $false
    }
    
    $json = $result | ConvertTo-Json -Compress
    [Console]::WriteLine($json)
    exit 1
}