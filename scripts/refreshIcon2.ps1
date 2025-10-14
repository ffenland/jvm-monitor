# Windows Icon Cache Refresh Script

Write-Host "=== Windows Icon Cache Refresh ===" -ForegroundColor Cyan

# Icon cache paths
$iconCachePath = "$env:LOCALAPPDATA\IconCache.db"
$iconCacheDir = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"

Write-Host "`n1. Stopping Explorer process..." -ForegroundColor Yellow
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "2. Deleting icon cache..." -ForegroundColor Yellow

# Delete IconCache.db
if (Test-Path $iconCachePath) {
    Remove-Item $iconCachePath -Force -ErrorAction SilentlyContinue
    Write-Host "   - IconCache.db deleted"
}

# Delete all iconcache files in Explorer folder
if (Test-Path $iconCacheDir) {
    Get-ChildItem -Path $iconCacheDir -Filter "iconcache*" | ForEach-Object {
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        Write-Host "   - $($_.Name) deleted"
    }
    
    Get-ChildItem -Path $iconCacheDir -Filter "thumbcache*" | ForEach-Object {
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        Write-Host "   - $($_.Name) deleted"
    }
}

Write-Host "3. Restarting Explorer..." -ForegroundColor Yellow
Start-Process explorer
Start-Sleep -Seconds 3

Write-Host "`n4. Checking executable properties..." -ForegroundColor Yellow
$exePath = "dist\win-unpacked\DrugLabel.exe"

if (Test-Path $exePath) {
    # Check file version info
    $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo((Resolve-Path $exePath))
    Write-Host "   - Product Name: $($versionInfo.ProductName)"
    Write-Host "   - Version: $($versionInfo.FileVersion)"
    Write-Host "   - Company: $($versionInfo.CompanyName)"
    
    # Check icon resource
    Add-Type -AssemblyName System.Drawing
    try {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Resolve-Path $exePath))
        if ($icon) {
            Write-Host "   - Icon Size: $($icon.Width) x $($icon.Height)" -ForegroundColor Green
            
            # Save icon as image for verification
            $bitmap = $icon.ToBitmap()
            $testPath = "test_icon.png"
            $bitmap.Save($testPath, [System.Drawing.Imaging.ImageFormat]::Png)
            Write-Host "   - Test icon saved: $testPath"
            
            $icon.Dispose()
            $bitmap.Dispose()
        }
    } catch {
        Write-Host "   - Icon extraction failed: $_" -ForegroundColor Red
    }
}

Write-Host "`n5. Opening Windows Explorer..." -ForegroundColor Yellow
Start-Process explorer.exe -ArgumentList (Resolve-Path 'dist\win-unpacked')

Write-Host "`n=== Complete ===" -ForegroundColor Green
Write-Host "Explorer is open. Check the DrugLabel.exe icon."
Write-Host "If default icon still shows:"
Write-Host "  1. Press F5 to refresh"
Write-Host "  2. Copy file to another folder and check"
Write-Host "  3. Check in file properties"