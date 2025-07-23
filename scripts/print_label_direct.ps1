# Brother 프린터 직접 출력 (COM 객체 없이)
# Windows 프린터 스풀러를 통한 직접 출력

param(
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
    # UTF-8 인코딩 설정
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    
    # 프린터 확인
    if ($printerName -eq "") {
        # 기본 Brother 프린터 찾기
        $defaultPrinter = Get-WmiObject -Class Win32_Printer | Where-Object { 
            ($_.Name -match "Brother" -or $_.DriverName -match "Brother") -and $_.Default -eq $true
        } | Select-Object -First 1
        
        if ($defaultPrinter) {
            $printerName = $defaultPrinter.Name
        } else {
            # 첫 번째 Brother 프린터 사용
            $brotherPrinter = Get-WmiObject -Class Win32_Printer | Where-Object { 
                $_.Name -match "Brother" -or $_.DriverName -match "Brother"
            } | Select-Object -First 1
            
            if ($brotherPrinter) {
                $printerName = $brotherPrinter.Name
            } else {
                throw "No Brother printer found"
            }
        }
    }
    
    # ESC/P 명령어를 사용한 라벨 출력 (Brother QL 시리즈용)
    $outputFile = [System.IO.Path]::GetTempFileName()
    $outputFile = [System.IO.Path]::ChangeExtension($outputFile, ".txt")
    
    # 라벨 내용 생성 (간단한 텍스트 형식)
    if ($medicineName -ne "") {
        # 약품별 라벨
        $labelContent = @"
================================
         약품 라벨
================================

약품명: $medicineName
환자명: $patientName
1일 복용량: $dailyDose
1회 복용량: $singleDose
처방일수: $prescriptionDays
출력일: $date
약국: $pharmacyName

================================
"@
    } else {
        # 처방전 라벨
        $labelContent = @"
================================
         처방전 라벨
================================

환자명: $patientName
병원: $hospitalName
접수일: $receiptDate
조제일: $prepareDate
처방번호: $prescriptionNo
의사: $doctorName
약품: $medicine

--- 처방 내용 ---
"@
    }
    
    # 약품 정보 추가 (처방전 라벨인 경우에만)
    if ($medicineName -eq "" -and $medicines -ne "") {
        try {
            $medicineList = $medicines | ConvertFrom-Json
            $index = 1
            foreach ($medicine in $medicineList) {
                if ($index -gt 5) { break }
                $labelContent += "`n$index. $($medicine.name)"
                if ($medicine.dosage) {
                    $labelContent += " - $($medicine.dosage)"
                }
                if ($medicine.frequency) {
                    $labelContent += " - $($medicine.frequency)"
                }
                $index++
            }
        } catch {
            # JSON 파싱 실패 시 무시
        }
        
        $labelContent += @"

================================
"@
    }
    
    # 파일로 저장
    [System.IO.File]::WriteAllText($outputFile, $labelContent, [System.Text.Encoding]::UTF8)
    
    # Windows 프린터로 직접 출력 - 특정 프린터 지정
    # .NET PrintDocument를 사용한 출력
    Add-Type -AssemblyName System.Drawing
    
    $printDoc = New-Object System.Drawing.Printing.PrintDocument
    $printDoc.PrinterSettings.PrinterName = $printerName
    
    # 프린터가 존재하는지 확인
    if (-not $printDoc.PrinterSettings.IsValid) {
        throw "Printer '$printerName' is not valid or not available"
    }
    
    # PrintPage 이벤트 핸들러
    $printDoc.add_PrintPage({
        param($sender, $e)
        
        $font = New-Object System.Drawing.Font("Courier New", 10)
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
        
        # 텍스트를 줄 단위로 출력
        $lines = [System.IO.File]::ReadAllLines($outputFile, [System.Text.Encoding]::UTF8)
        $y = 10
        foreach ($line in $lines) {
            $e.Graphics.DrawString($line, $font, $brush, 10, $y)
            $y += 15
        }
        
        $font.Dispose()
        $brush.Dispose()
    })
    
    # 인쇄 실행
    $printDoc.Print()
    $printDoc.Dispose()
    
    # 출력 완료 대기
    Start-Sleep -Seconds 2
    
    # 임시 파일 삭제
    if (Test-Path $outputFile) {
        Remove-Item $outputFile -Force
    }
    
    $result = @{
        error = $false
        message = "Label sent to printer: $printerName (Direct print method)"
    }
    
    $json = $result | ConvertTo-Json -Compress
    [Console]::WriteLine($json)
}
catch {
    $result = @{
        error = $true
        message = "Error printing label: $($_.Exception.Message)"
    }
    
    $json = $result | ConvertTo-Json -Compress
    [Console]::WriteLine($json)
    
    # 임시 파일 정리
    if ($outputFile -and (Test-Path $outputFile)) {
        Remove-Item $outputFile -Force -ErrorAction SilentlyContinue
    }
    
    exit 1
}