# Brother 프린터 직접 접근 테스트
# COM 객체 없이 프린터 사용

param()

Write-Host "Testing Direct Printer Access" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

# 시스템에 설치된 모든 프린터 확인
Write-Host "`nAll installed printers:" -ForegroundColor Yellow
$allPrinters = Get-WmiObject -Class Win32_Printer | Select-Object Name, DriverName, PortName, DeviceID, Default

foreach ($printer in $allPrinters) {
    if ($printer.Default) {
        Write-Host "[DEFAULT] " -NoNewline -ForegroundColor Green
    }
    Write-Host "$($printer.Name)" -ForegroundColor White
    Write-Host "  Driver: $($printer.DriverName)" -ForegroundColor Gray
    Write-Host "  Port: $($printer.PortName)" -ForegroundColor Gray
    Write-Host ""
}

# Brother 프린터만 필터링
Write-Host "Brother printers only:" -ForegroundColor Yellow
$brotherPrinters = $allPrinters | Where-Object { 
    $_.Name -match "Brother" -or $_.DriverName -match "Brother" 
}

if ($brotherPrinters.Count -eq 0) {
    Write-Host "No Brother printers found!" -ForegroundColor Red
    Write-Host "`nPlease make sure:" -ForegroundColor Yellow
    Write-Host "1. Brother QL-700 printer is connected via USB" -ForegroundColor White
    Write-Host "2. Printer drivers are installed" -ForegroundColor White
    Write-Host "3. Printer appears in Windows 'Printers & scanners'" -ForegroundColor White
} else {
    foreach ($printer in $brotherPrinters) {
        Write-Host "- $($printer.Name)" -ForegroundColor Green
        if ($printer.PortName -match "USB") {
            Write-Host "  (USB Connected)" -ForegroundColor Cyan
        }
    }
}

# 프린터 추가 제안
if ($brotherPrinters.Count -eq 0) {
    Write-Host "`nTo add Brother QL-700 printer:" -ForegroundColor Yellow
    Write-Host "1. Connect printer via USB" -ForegroundColor White
    Write-Host "2. Turn on the printer" -ForegroundColor White
    Write-Host "3. Windows Settings > Devices > Printers & scanners" -ForegroundColor White
    Write-Host "4. Click 'Add a printer or scanner'" -ForegroundColor White
    Write-Host "5. Wait for Windows to detect the printer" -ForegroundColor White
    Write-Host "6. If not detected, click 'The printer that I want isn't listed'" -ForegroundColor White
    Write-Host "7. Select 'Add a local printer or network printer with manual settings'" -ForegroundColor White
    Write-Host "8. Choose USB port and Brother QL-700 driver" -ForegroundColor White
}