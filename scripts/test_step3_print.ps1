# Step 3: Actual print test
param(
    [string]$templatePath,
    [string]$printerName = "Brother QL-700"
)

Write-Host "=== Step 3: Actual Print Test ===" -ForegroundColor Cyan
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
    
    # Set printer
    Write-Host "Setting printer to: $printerName"
    $setPrinterResult = $bpac.SetPrinter($printerName, $false)
    Write-Host "  SetPrinter result: $setPrinterResult"
    
    # Set some test data
    Write-Host ""
    Write-Host "Setting test data..."
    $testData = @{
        "medicineName" = "mmeedd"
        "patientName" = "Test Patient"
        "dailyDose" = "3"
        "prescriptionDays" = "7"
        "date" = Get-Date -Format "yyyy-MM-dd"
    }
    
    foreach ($field in $testData.GetEnumerator()) {
        try {
            $obj = $bpac.GetObject($field.Key)
            if ($obj -ne $null) {
                $obj.Text = $field.Value
                Write-Host "  ✓ Set $($field.Key) = $($field.Value)" -ForegroundColor Green
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
            }
        } catch {
            Write-Host "  ✗ Could not set $($field.Key)" -ForegroundColor Yellow
        }
    }
    
    # Try to print
    Write-Host ""
    Write-Host "Starting print job..."
    $printJobName = "Test_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    Write-Host "  Job name: $printJobName"
    
    $startResult = $bpac.StartPrint($printJobName, 0)
    Write-Host "  StartPrint result: $startResult"
    
    if ($startResult -eq $true) {
        Write-Host "  ✓ Print job started" -ForegroundColor Green
        
        Write-Host "  Sending to printer..."
        $printResult = $bpac.PrintOut(1, 0)
        Write-Host "  PrintOut result: $printResult"
        
        if ($printResult -eq $true) {
            Write-Host "  ✓ Print command sent" -ForegroundColor Green
        } else {
            Write-Host "  ✗ PrintOut failed" -ForegroundColor Red
        }
        
        $endResult = $bpac.EndPrint()
        Write-Host "  EndPrint result: $endResult"
        
        Write-Host ""
        Write-Host "✓ Print job completed!" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Failed to start print job" -ForegroundColor Red
        
        # Try to get more info
        Write-Host ""
        Write-Host "Debugging info:"
        Write-Host "  - Template: $templatePath"
        Write-Host "  - Printer: $($bpac.Printer)"
        Write-Host "  - StartPrint return: $startResult"
    }
    
    # Close document
    $bpac.Close()
    
    # Release COM object
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    
    Write-Host ""
    Write-Host "Test completed!" -ForegroundColor Green
    
} catch {
    Write-Host "✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Red
    
    if ($bpac -ne $null) {
        try {
            $bpac.Close()
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
        } catch {}
    }
    
    exit 1
}