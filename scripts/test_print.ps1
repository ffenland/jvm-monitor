# Brother 프린터 출력 테스트
param(
    [string]$printerName = "Brother QL-700"
)

Write-Host "Brother Printer Test" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan

# 프린터 확인
$printer = Get-CimInstance -Class Win32_Printer | Where-Object { $_.Name -eq $printerName }

if ($printer) {
    Write-Host "Found printer: $($printer.Name)" -ForegroundColor Green
    Write-Host "Status: $($printer.PrinterStatus)" -ForegroundColor Gray
    Write-Host "Port: $($printer.PortName)" -ForegroundColor Gray
    Write-Host ""
    
    # 테스트 라벨 출력
    Write-Host "Sending test label..." -ForegroundColor Yellow
    
    # 직접 출력 테스트
    & "$PSScriptRoot\print_label_direct.ps1" `
        -printerName $printerName `
        -patientName "테스트 환자" `
        -hospitalName "테스트 병원" `
        -receiptDate (Get-Date -Format "yyyy-MM-dd") `
        -prescriptionNo "TEST-001"
        
} else {
    Write-Host "Printer not found: $printerName" -ForegroundColor Red
    Write-Host ""
    Write-Host "Available printers:" -ForegroundColor Yellow
    Get-CimInstance -Class Win32_Printer | Select-Object Name | ForEach-Object {
        Write-Host "  - $($_.Name)"
    }
}