# Step 2: Printer setup test
param(
    [string]$templatePath,
    [string]$printerName = "Brother QL-700"
)

Write-Host "=== Step 2: Printer Setup Test ===" -ForegroundColor Cyan
Write-Host ""

try {
    # Create b-PAC object
    Write-Host "Creating b-PAC COM object..."
    $bpac = New-Object -ComObject "bpac.Document"
    Write-Host "✓ COM object created" -ForegroundColor Green
    
    # Open template
    Write-Host "Opening template..."
    $openResult = $bpac.Open($templatePath)
    if (-not $openResult) {
        throw "Failed to open template"
    }
    Write-Host "✓ Template opened" -ForegroundColor Green
    
    # Get current printer
    Write-Host ""
    Write-Host "Current printer: $($bpac.Printer)"
    
    # List available printers
    Write-Host ""
    Write-Host "Available Brother printers:"
    $brotherPrinters = Get-WmiObject -Class Win32_Printer | Where-Object { $_.Name -like "*Brother*" }
    foreach ($printer in $brotherPrinters) {
        Write-Host "  - $($printer.Name)"
        if ($printer.Default) {
            Write-Host "    (Default)" -ForegroundColor Yellow
        }
    }
    
    # Try to set printer
    Write-Host ""
    Write-Host "Setting printer to: $printerName"
    $setPrinterResult = $bpac.SetPrinter($printerName, $false)
    
    if ($setPrinterResult -eq $true) {
        Write-Host "✓ Printer set successfully" -ForegroundColor Green
        Write-Host "  New printer: $($bpac.Printer)"
    } else {
        Write-Host "✗ Failed to set printer" -ForegroundColor Red
        Write-Host "  SetPrinter returned: $setPrinterResult"
        
        # Try alternative method
        Write-Host ""
        Write-Host "Trying alternative printer name..."
        $altPrinterResult = $bpac.SetPrinter("Brother QL-700", $true)
        Write-Host "  Alternative result: $altPrinterResult"
    }
    
    # Close document
    $bpac.Close()
    
    # Release COM object
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    
    Write-Host ""
    Write-Host "Test completed!" -ForegroundColor Green
    
} catch {
    Write-Host "✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($bpac -ne $null) {
        try {
            $bpac.Close()
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
        } catch {}
    }
    
    exit 1
}