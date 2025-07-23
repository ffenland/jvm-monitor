# PowerShell 기본 출력 억제
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

param(
    [string]$templatePath,
    [string]$printerName = "",
    [string]$patientName = "",
    [string]$hospitalName = "",
    [string]$receiptDate = "",
    [string]$prepareDate = "",
    [string]$prescriptionNo = "",
    [string]$doctorName = "",
    [string]$medicines = "",  # JSON string of medicines array
    [string]$medicine = "",  # 단일 약품명 (테스트용)
    [string]$medicineName = "",
    [string]$dailyDose = "",
    [string]$singleDose = "",
    [string]$prescriptionDays = "",
    [string]$date = "",
    [string]$pharmacyName = ""
)

try {
    # B-PAC COM 객체 생성 (다양한 버전 시도)
    $bpac = $null
    $comObject = ""
    
    # Brother 공식 문서에 따른 COM 객체 이름들 (버전별)
    $comNames = @(
        "bpac.Document",      # b-PAC SDK 3.0
        "b-PAC.Document",     # 이전 버전 호환
        "bpac3.Document",     # b-PAC SDK 3.1 이상
        "Brother.bpac.Document", # 일부 버전
        "BrssCom.Document"    # 매우 오래된 버전
    )
    
    $lastError = ""
    
    foreach ($com in $comNames) {
        try {
            $bpac = New-Object -ComObject $com
            if ($bpac -ne $null) {
                $comObject = $com
                break
            }
        } catch {
            $lastError = $_.Exception.Message
            continue
        }
    }
    
    if ($bpac -eq $null) {
        $result = @{
            error = $true
            message = "b-PAC COM object could not be created. Please ensure Brother b-PAC SDK is installed. Last error: $lastError"
            testedObjects = $comNames
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        exit 1
    }
    
    # 템플릿 파일이 존재하는지 확인
    if (![System.IO.File]::Exists($templatePath)) {
        # 기본 템플릿 경로도 시도
        $defaultTemplate = Join-Path $PSScriptRoot "..\templates\prescription_label.lbx"
        if ([System.IO.File]::Exists($defaultTemplate)) {
            $templatePath = $defaultTemplate
        } else {
            $result = @{
                error = $true
                message = "Template file not found: $templatePath"
            }
            Write-Output ($result | ConvertTo-Json -Compress)
            exit 1
        }
    }
    
    # 템플릿 열기
    $openResult = $bpac.Open($templatePath)
    if (-not $openResult) {
        $result = @{
            error = $true
            message = "Failed to open template file: $templatePath"
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        exit 1
    }
    
    # 프린터 설정
    if ($printerName -ne "") {
        $setPrinterResult = $bpac.SetPrinter($printerName, $false)
        if (-not $setPrinterResult) {
            # 프린터 설정 실패시 기본 Brother 프린터 찾기
            $defaultPrinter = Get-WmiObject -Class Win32_Printer | Where-Object { 
                $_.Name -match "Brother" -and $_.Default -eq $true 
            } | Select-Object -First 1
            
            if ($defaultPrinter) {
                $bpac.SetPrinter($defaultPrinter.Name, $false)
            }
        }
    }
    
    # 텍스트 객체에 데이터 설정
    # 템플릿 필드명은 template-info.json 참조
    $fields = @{
        "patientName" = $patientName
        "hospitalName" = $hospitalName
        "receiptDate" = $receiptDate
        "prepareDate" = $prepareDate
        "prescriptionNo" = $prescriptionNo
        "doctorName" = $doctorName
        "medicine" = $medicine  # 테스트 템플릿용 필드
        "medicineName" = $medicineName
        "dailyDose" = $dailyDose
        "singleDose" = $singleDose
        "prescriptionDays" = $prescriptionDays
        "date" = $date
        "pharmacyName" = $pharmacyName
    }
    
    foreach ($field in $fields.GetEnumerator()) {
        if ($field.Value -ne "") {
            try {
                $obj = $bpac.GetObject($field.Key)
                if ($obj -ne $null) {
                    $obj.Text = $field.Value
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                }
            } catch {
                # 객체를 찾을 수 없는 경우 무시 - 에러 로그 없이 계속 진행
            }
        }
    }
    
    # 약품 정보 처리
    if ($medicines -ne "") {
        try {
            $medicineList = $medicines | ConvertFrom-Json
            $index = 1
            foreach ($medicine in $medicineList) {
                if ($index -gt 5) { break }  # 최대 5개까지만
                
                # 약품명
                try {
                    $obj = $bpac.GetObject("medicine$index")
                    if ($obj -ne $null) {
                        $obj.Text = $medicine.name
                        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                    }
                } catch {}
                
                # 용량
                try {
                    $obj = $bpac.GetObject("dosage$index")
                    if ($obj -ne $null) {
                        $obj.Text = $medicine.dosage
                        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                    }
                } catch {}
                
                # 복용법
                try {
                    $obj = $bpac.GetObject("frequency$index")
                    if ($obj -ne $null) {
                        $obj.Text = $medicine.frequency
                        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                    }
                } catch {}
                
                $index++
            }
            
            # 총 약품 수
            try {
                $obj = $bpac.GetObject("medicineCount")
                if ($obj -ne $null) {
                    $obj.Text = $medicineList.Count.ToString()
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                }
            } catch {}
        } catch {
            # JSON 파싱 실패 무시
        }
    }
    
    # 출력 실행 - Brother 매뉴얼 방식
    $printJobName = "Prescription_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    $startPrintResult = $bpac.StartPrint($printJobName, 0)
    
    if ($startPrintResult -eq $true) {
        $printOutResult = $bpac.PrintOut(1, 0)  # 1장 출력
        $endResult = $bpac.EndPrint()
        
        if ($printOutResult -ne $true) {
            $result = @{
                error = $true
                message = "Failed to print label. Please check printer connection."
            }
            Write-Output ($result | ConvertTo-Json -Compress)
            exit 1
        }
    } else {
        $result = @{
            error = $true
            message = "Failed to start print job. Please check printer settings."
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        exit 1
    }
    
    # 문서 닫기
    $bpac.Close()
    
    # COM 객체 해제
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    $bpac = $null
    
    $result = @{
        error = $false
        message = "Label printed successfully using $comObject"
    }
    Write-Output ($result | ConvertTo-Json -Compress)
}
catch {
    $result = @{
        error = $true
        message = "Error printing label: $($_.Exception.Message)"
    }
    Write-Output ($result | ConvertTo-Json -Compress)
    
    # COM 객체 정리
    if ($bpac -ne $null) {
        try {
            $bpac.Close()
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
        } catch {}
    }
    
    exit 1
}