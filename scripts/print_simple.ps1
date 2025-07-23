# PowerShell print label script
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

param(
    [string]$templatePath,
    [string]$printerName = "",
    [string]$patientName = "",
    [string]$hospitalName = "",
    [string]$receiptDate = "",
    [string]$prepareDate = "",
    [string]$prescriptionNo = "",
    [string]$doctorName = "",
    [string]$medicines = "",
    [string]$medicine = "",
    [string]$medicineName = "",
    [string]$dailyDose = "",
    [string]$singleDose = "",
    [string]$prescriptionDays = "",
    [string]$date = "",
    [string]$pharmacyName = ""
)

try {
    # Create b-PAC COM object
    $bpac = $null
    $comObject = ""
    
    $comNames = @(
        "bpac.Document",
        "b-PAC.Document",
        "bpac3.Document",
        "Brother.bpac.Document",
        "BrssCom.Document"
    )
    
    $lastError = ""
    
    foreach ($com in $comNames) {
        try {
            $bpac = New-Object -ComObject $com
            if ($bpac -ne $null) {
                $comObject = $com
                break
            }
        } catch {
            $lastError = $_.Exception.Message
            continue
        }
    }
    
    if ($bpac -eq $null) {
        $result = @{
            error = $true
            message = "b-PAC COM object could not be created. Please ensure Brother b-PAC SDK is installed. Last error: $lastError"
            testedObjects = $comNames
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        exit 1
    }
    
    # Check template file exists
    if (![System.IO.File]::Exists($templatePath)) {
        $result = @{
            error = $true
            message = "Template file not found: $templatePath"
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        exit 1
    }
    
    # Open template
    $openResult = $bpac.Open($templatePath)
    if (-not $openResult) {
        $result = @{
            error = $true
            message = "Failed to open template file: $templatePath"
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        exit 1
    }
    
    # Set printer
    if ($printerName -ne "") {
        $setPrinterResult = $bpac.SetPrinter($printerName, $false)
        if (-not $setPrinterResult) {
            # Try to find default Brother printer
            $defaultPrinter = Get-WmiObject -Class Win32_Printer | Where-Object { 
                $_.Name -match "Brother" -and $_.Default -eq $true 
            } | Select-Object -First 1
            
            if ($defaultPrinter) {
                $bpac.SetPrinter($defaultPrinter.Name, $false)
            }
        }
    }
    
    # Set text data to template fields
    $fields = @{
        "patientName" = $patientName
        "hospitalName" = $hospitalName
        "receiptDate" = $receiptDate
        "prepareDate" = $prepareDate
        "prescriptionNo" = $prescriptionNo
        "doctorName" = $doctorName
        "medicine" = $medicine
        "medicineName" = $medicineName
        "dailyDose" = $dailyDose
        "singleDose" = $singleDose
        "prescriptionDays" = $prescriptionDays
        "date" = $date
        "pharmacyName" = $pharmacyName
    }
    
    foreach ($field in $fields.GetEnumerator()) {
        if ($field.Value -ne "") {
            try {
                $obj = $bpac.GetObject($field.Key)
                if ($obj -ne $null) {
                    $obj.Text = $field.Value
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                }
            } catch {
                # Field not found in template - ignore
            }
        }
    }
    
    # Execute print
    $printJobName = "Prescription_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    $startPrintResult = $bpac.StartPrint($printJobName, 0)
    
    if ($startPrintResult -eq $true) {
        $printOutResult = $bpac.PrintOut(1, 0)
        $endResult = $bpac.EndPrint()
        
        if ($printOutResult -ne $true) {
            $result = @{
                error = $true
                message = "Failed to print label. Please check printer connection."
            }
            Write-Output ($result | ConvertTo-Json -Compress)
            exit 1
        }
    } else {
        $result = @{
            error = $true
            message = "Failed to start print job. Please check printer settings."
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        exit 1
    }
    
    # Close document
    $bpac.Close()
    
    # Release COM object
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    $bpac = $null
    
    $result = @{
        error = $false
        message = "Label printed successfully using $comObject"
    }
    Write-Output ($result | ConvertTo-Json -Compress)
}
catch {
    $result = @{
        error = $true
        message = "Error printing label: $($_.Exception.Message)"
    }
    Write-Output ($result | ConvertTo-Json -Compress)
    
    # Cleanup COM object
    if ($bpac -ne $null) {
        try {
            $bpac.Close()
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
        } catch {}
    }
    
    exit 1
}