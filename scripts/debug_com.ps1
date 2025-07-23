# This script inspects the bpac.Document COM object and lists its members.

$OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $bpacDoc = New-Object -ComObject bpac.Document
    # Use Get-Member to list all methods and properties
    $members = $bpacDoc | Get-Member
    $memberList = $members | ForEach-Object { $_.Name }
    
    $memberList | ConvertTo-Json -Compress
}
catch {
    $errorDetails = @{
        error = $true
        message = $_.Exception.Message
    }
    $errorDetails | ConvertTo-Json -Compress
    exit 1
}
