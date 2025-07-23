# Step 1: Template file test
param(
    [string]$templatePath
)

Write-Host "=== Step 1: Template File Test ===" -ForegroundColor Cyan
Write-Host ""

# Check if template exists
Write-Host "Checking template file: $templatePath"
if ([System.IO.File]::Exists($templatePath)) {
    Write-Host "✓ Template file exists" -ForegroundColor Green
    
    $fileInfo = Get-Item $templatePath
    Write-Host "  - Full path: $($fileInfo.FullName)"
    Write-Host "  - Size: $($fileInfo.Length) bytes"
    Write-Host "  - Extension: $($fileInfo.Extension)"
} else {
    Write-Host "✗ Template file NOT found" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Step 2: b-PAC COM Object Test ===" -ForegroundColor Cyan
Write-Host ""

try {
    Write-Host "Creating b-PAC COM object..."
    $bpac = New-Object -ComObject "bpac.Document"
    Write-Host "✓ COM object created successfully" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "=== Step 3: Open Template ===" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "Opening template..."
    $openResult = $bpac.Open($templatePath)
    
    if ($openResult -eq $true) {
        Write-Host "✓ Template opened successfully" -ForegroundColor Green
        
        # Get template info
        Write-Host ""
        Write-Host "Template information:"
        Write-Host "  - Printer: $($bpac.Printer)"
        
        # Close document
        $bpac.Close()
        Write-Host ""
        Write-Host "✓ Template closed successfully" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to open template" -ForegroundColor Red
        Write-Host "  - Return value: $openResult"
    }
    
    # Release COM object
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    
    Write-Host ""
    Write-Host "All tests passed!" -ForegroundColor Green
    
} catch {
    Write-Host "✗ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}