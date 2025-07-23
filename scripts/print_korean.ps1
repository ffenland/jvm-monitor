# PowerShell script for Korean printing - UTF-8 with BOM
# This script handles Korean text properly
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

param(
    [string]$templatePath,
    [string]$printerName = "Brother QL-700"
)

Write-Host "=== Korean Print Test ===" -ForegroundColor Cyan
Write-Host ""

try {
    # Create b-PAC object
    Write-Host "Creating b-PAC COM object..."
    $bpac = New-Object -ComObject "bpac.Document"
    Write-Host "COM object created" -ForegroundColor Green
    
    # Open template
    Write-Host "Opening template..."
    $openResult = $bpac.Open($templatePath)
    if (-not $openResult) {
        throw "Failed to open template"
    }
    Write-Host "Template opened" -ForegroundColor Green
    
    # Set printer
    Write-Host "Setting printer to: $printerName"
    $bpac.SetPrinter($printerName, $false)
    
    # Korean test data
    Write-Host ""
    Write-Host "Setting Korean test data..."
    
    # Method 1: Direct Korean text
    try {
        $obj = $bpac.GetObject("medicineName")
        if ($obj -ne $null) {
            $koreanText = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("타이레놀"))
            $obj.Text = $koreanText
            Write-Host "  Set medicineName = $koreanText" -ForegroundColor Green
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
        }
    } catch {}
    
    try {
        $obj = $bpac.GetObject("patientName")
        if ($obj -ne $null) {
            $koreanName = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::UTF8.GetBytes("홍길동"))
            $obj.Text = $koreanName
            Write-Host "  Set patientName = $koreanName" -ForegroundColor Green
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
        }
    } catch {}
    
    try {
        $obj = $bpac.GetObject("dailyDose")
        if ($obj -ne $null) {
            $obj.Text = "3"
            Write-Host "  Set dailyDose = 3" -ForegroundColor Green
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
        }
    } catch {}
    
    try {
        $obj = $bpac.GetObject("prescriptionDays")
        if ($obj -ne $null) {
            $obj.Text = "7"
            Write-Host "  Set prescriptionDays = 7" -ForegroundColor Green
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
        }
    } catch {}
    
    try {
        $obj = $bpac.GetObject("date")
        if ($obj -ne $null) {
            $obj.Text = Get-Date -Format "yyyy-MM-dd"
            Write-Host "  Set date = $(Get-Date -Format 'yyyy-MM-dd')" -ForegroundColor Green
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
        }
    } catch {}
    
    # Print
    Write-Host ""
    Write-Host "Starting print job..."
    $printJobName = "Korean_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    
    $startResult = $bpac.StartPrint($printJobName, 0)
    if ($startResult -eq $true) {
        Write-Host "Print job started" -ForegroundColor Green
        $bpac.PrintOut(1, 0)
        $bpac.EndPrint()
        Write-Host "Print job completed!" -ForegroundColor Green
    } else {
        Write-Host "Failed to start print job" -ForegroundColor Red
    }
    
    # Close
    $bpac.Close()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    
    Write-Host ""
    Write-Host "Test completed!" -ForegroundColor Green
    
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($bpac -ne $null) {
        try {
            $bpac.Close()
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
        } catch {}
    }
    
    exit 1
}