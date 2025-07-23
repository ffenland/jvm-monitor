# 간단한 출력 테스트
param(
    [string]$printerName = "",
    [string]$text = "Brother Printer Test"
)

Write-Host "=== Simple Print Test ===" -ForegroundColor Cyan
Write-Host ""

try {
    # COM 객체 생성
    Write-Host "Creating b-PAC COM object..." -ForegroundColor Yellow
    $bpac = New-Object -ComObject "bpac.Document"
    
    if ($bpac -eq $null) {
        throw "Failed to create b-PAC COM object"
    }
    
    Write-Host "COM object created successfully!" -ForegroundColor Green
    
    # 사용 가능한 프린터 목록 가져오기
    Write-Host ""
    Write-Host "Getting printer list..." -ForegroundColor Yellow
    
    # 프린터 목록이 없으면 기본 Brother 프린터 사용
    if ($printerName -eq "") {
        $brotherPrinter = Get-WmiObject -Class Win32_Printer | 
            Where-Object { $_.Name -like "*Brother*" } | 
            Select-Object -First 1
        
        if ($brotherPrinter) {
            $printerName = $brotherPrinter.Name
            Write-Host "Using Brother printer: $printerName" -ForegroundColor Green
        }
    }
    
    # 간단한 템플릿 생성 (메모리에서)
    Write-Host ""
    Write-Host "Creating simple label..." -ForegroundColor Yellow
    
    # 새 문서 생성
    $bpac.StartDesign()
    
    # 텍스트 객체 추가
    $textObj = $bpac.GetObject("Text1")
    if ($textObj) {
        $textObj.Text = $text
    }
    
    # 프린터 설정
    if ($printerName -ne "") {
        Write-Host "Setting printer: $printerName" -ForegroundColor Yellow
        $bpac.SetPrinter($printerName, $false)
    }
    
    # 출력
    Write-Host "Printing..." -ForegroundColor Yellow
    $printResult = $bpac.StartPrint("Test Print", 0)
    if ($printResult) {
        $bpac.PrintOut(1, 0)
        $bpac.EndPrint()
        Write-Host "Print job sent successfully!" -ForegroundColor Green
    } else {
        Write-Host "Failed to start print job" -ForegroundColor Red
    }
    
    # 문서 닫기
    $bpac.Close()
    
    # COM 객체 해제
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    
    Write-Host ""
    Write-Host "Test completed!" -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Message -like "*80040154*") {
        Write-Host ""
        Write-Host "b-PAC COM object is not registered." -ForegroundColor Yellow
        Write-Host "Please run the following as Administrator:" -ForegroundColor Yellow
        Write-Host "  PowerShell -ExecutionPolicy Bypass -File `"$PSScriptRoot\register_bpac_dll.ps1`"" -ForegroundColor Gray
    }
}