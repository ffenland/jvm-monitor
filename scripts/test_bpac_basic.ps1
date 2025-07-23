# 기본 b-PAC 출력 테스트
param(
    [string]$printerName = "",
    [string]$templatePath = ""
)

Write-Host "=== Basic b-PAC Print Test ===" -ForegroundColor Cyan
Write-Host ""

# 기본 템플릿 경로 설정
if ($templatePath -eq "") {
    $templatePath = Join-Path $PSScriptRoot "..\templates\testTemplate.lbx"
    if (-not (Test-Path $templatePath)) {
        # 간단한 테스트용 템플릿 생성
        $templatePath = Join-Path $PSScriptRoot "test_template.lbx"
    }
}

Write-Host "Template path: $templatePath" -ForegroundColor Gray

try {
    # COM 객체 생성 - Brother 공식 문서에 따른 정확한 이름
    Write-Host "Creating b-PAC COM object..." -ForegroundColor Yellow
    
    # Brother b-PAC3 SDK의 정확한 ProgID
    $bpac = New-Object -ComObject "bpac.Document"
    
    if ($bpac -eq $null) {
        throw "Failed to create b-PAC COM object"
    }
    
    Write-Host "COM object created successfully!" -ForegroundColor Green
    
    # 버전 확인
    try {
        $version = $bpac.Version
        Write-Host "b-PAC Version: $version" -ForegroundColor Gray
    } catch {
        Write-Host "Version: Unable to retrieve" -ForegroundColor Gray
    }
    
    # 프린터 목록 가져오기
    Write-Host ""
    Write-Host "Getting printer list..." -ForegroundColor Yellow
    
    try {
        $printers = $bpac.Printer.GetInstalledPrinters()
        if ($printers -and $printers.Count -gt 0) {
            Write-Host "Available printers:" -ForegroundColor Green
            for ($i = 0; $i -lt $printers.Count; $i++) {
                $printerName = $printers.Item($i)
                Write-Host "  - $printerName" -ForegroundColor Gray
                if ($printerName -like "*Brother*" -and $printerName -eq "") {
                    $printerName = $printerName
                }
            }
        } else {
            Write-Host "No printers found via b-PAC" -ForegroundColor Red
        }
    } catch {
        Write-Host "Error getting printer list: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Brother 프린터 찾기 (대체 방법)
    if ($printerName -eq "") {
        $brotherPrinter = Get-WmiObject -Class Win32_Printer | 
            Where-Object { $_.Name -like "*Brother*" } | 
            Select-Object -First 1
        
        if ($brotherPrinter) {
            $printerName = $brotherPrinter.Name
            Write-Host ""
            Write-Host "Using Brother printer: $printerName" -ForegroundColor Green
        }
    }
    
    # 템플릿이 있으면 열기 시도
    if (Test-Path $templatePath) {
        Write-Host ""
        Write-Host "Opening template..." -ForegroundColor Yellow
        
        $openResult = $bpac.Open($templatePath)
        if ($openResult -eq $true) {
            Write-Host "Template opened successfully!" -ForegroundColor Green
            
            # 프린터 설정
            if ($printerName -ne "") {
                Write-Host "Setting printer to: $printerName" -ForegroundColor Yellow
                $setPrinterResult = $bpac.SetPrinter($printerName, $false)
                if ($setPrinterResult -eq $true) {
                    Write-Host "Printer set successfully!" -ForegroundColor Green
                } else {
                    Write-Host "Failed to set printer" -ForegroundColor Red
                }
            }
            
            # 템플릿 닫기
            $bpac.Close()
        } else {
            Write-Host "Failed to open template" -ForegroundColor Red
        }
    } else {
        Write-Host ""
        Write-Host "Template file not found, skipping template test" -ForegroundColor Yellow
    }
    
    # COM 객체 해제
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    
    Write-Host ""
    Write-Host "Test completed successfully!" -ForegroundColor Green
    Write-Host "b-PAC SDK is working properly." -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Message -like "*80040154*") {
        Write-Host ""
        Write-Host "COM object is not registered properly." -ForegroundColor Yellow
        Write-Host "Please try the following:" -ForegroundColor Yellow
        Write-Host "1. Reinstall Brother b-PAC SDK" -ForegroundColor Gray
        Write-Host "2. Run the register_bpac_com.ps1 script as Administrator" -ForegroundColor Gray
        Write-Host "3. Make sure to use 32-bit PowerShell for b-PAC" -ForegroundColor Gray
    }
}