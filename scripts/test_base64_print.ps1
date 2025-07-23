# Simple b-PAC print test with Base64 decoding
param(
    [string]$encodedTemplatePath,
    [string]$encodedPrinterName
)

# Test Base64 decoding
Write-Host "Testing Base64 decoding..."
Write-Host "Encoded template path: $encodedTemplatePath"
Write-Host "Encoded printer name: $encodedPrinterName"

# Decode function
function Decode-Base64($base64String) {
    if ($base64String -eq "") { return "" }
    try {
        $bytes = [System.Convert]::FromBase64String($base64String)
        return [System.Text.Encoding]::UTF8.GetString($bytes)
    } catch {
        Write-Host "Failed to decode: $base64String"
        return $base64String
    }
}

# Decode parameters
$templatePath = Decode-Base64 $encodedTemplatePath
$printerName = Decode-Base64 $encodedPrinterName

Write-Host "Decoded template path: $templatePath"
Write-Host "Decoded printer name: $printerName"

# Check if template exists
if (![System.IO.File]::Exists($templatePath)) {
    Write-Host "ERROR: Template file not found at: $templatePath"
    exit 1
}

Write-Host "Template file exists!"

# Try to create b-PAC object
try {
    Write-Host "Creating b-PAC COM object..."
    $bpac = New-Object -ComObject "bpac.Document"
    Write-Host "b-PAC COM object created successfully!"
    
    # Open template
    Write-Host "Opening template..."
    $openResult = $bpac.Open($templatePath)
    Write-Host "Template open result: $openResult"
    
    if ($openResult) {
        # Set printer if provided
        if ($printerName -ne "") {
            Write-Host "Setting printer to: $printerName"
            $setPrinterResult = $bpac.SetPrinter($printerName, $false)
            Write-Host "Set printer result: $setPrinterResult"
        }
        
        # Try to set some test data
        Write-Host "Setting test data..."
        try {
            $obj = $bpac.GetObject("medicine")
            if ($obj -ne $null) {
                $obj.Text = "Test Medicine"
                Write-Host "Set medicine field to: Test Medicine"
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
            }
        } catch {
            Write-Host "Could not set medicine field (might not exist in template)"
        }
        
        # Try to print
        Write-Host "Starting print..."
        $printJobName = "Test_" + (Get-Date -Format "yyyyMMdd_HHmmss")
        $startResult = $bpac.StartPrint($printJobName, 0)
        Write-Host "StartPrint result: $startResult"
        
        if ($startResult) {
            $printResult = $bpac.PrintOut(1, 0)
            Write-Host "PrintOut result: $printResult"
            
            $endResult = $bpac.EndPrint()
            Write-Host "EndPrint result: $endResult"
            
            Write-Host "Print job completed!"
        }
        
        # Close document
        $bpac.Close()
    }
    
    # Release COM object
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    
    Write-Host "Test completed successfully!"
    
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host "Stack trace: $($_.ScriptStackTrace)"
    exit 1
}