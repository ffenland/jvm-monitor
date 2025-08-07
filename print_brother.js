const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * PowerShell 스크립트를 실행하는 헬퍼 함수 (한글 지원)
 * @param {object} params Parameters to embed in the script
 * @returns {Promise<object>} A promise that resolves with the result
 */
async function executePowerShellWithKorean(params = {}) {
    return new Promise((resolve, reject) => {
        // PowerShell 실행 경로 - 항상 32비트 버전 사용 (b-PAC은 32비트 COM)
        const powershellPath = 'C:\\WINDOWS\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';
        
        // Generate PowerShell script with embedded Korean text
        const scriptContent = `
# Auto-generated PowerShell script for Korean printing
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    # Create b-PAC COM object
    $bpac = New-Object -ComObject "bpac.Document"
    
    # Open template
    $templatePath = "${params.templatePath.replace(/\\/g, '\\\\')}"
    $openResult = $bpac.Open($templatePath)
    if (-not $openResult) {
        throw "Failed to open template file: $templatePath"
    }
    
    # Set printer
    $printerName = "${params.printerName || 'Brother QL-700'}"
    $bpac.SetPrinter($printerName, $false)
    
    # Set text data to template fields
    ${Object.entries(params).map(([key, value]) => {
        if (key !== 'templatePath' && key !== 'printerName' && key !== 'medicines' && value) {
            return `
    try {
        $obj = $bpac.GetObject("${key}")
        if ($obj -ne $null) {
            $obj.Text = "${value.toString().replace(/"/g, '`"')}"
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
        }
    } catch {}`;
        }
        return '';
    }).join('')}
    
    # Process medicines array if provided
    ${params.medicines ? `
    try {
        $medicinesJson = '${params.medicines}'
        $medicineList = $medicinesJson | ConvertFrom-Json
        $index = 1
        foreach ($medicine in $medicineList) {
            if ($index -gt 5) { break }
            
            try {
                $obj = $bpac.GetObject("medicine$index")
                if ($obj -ne $null) {
                    $obj.Text = $medicine.name
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                }
            } catch {}
            
            try {
                $obj = $bpac.GetObject("dosage$index")
                if ($obj -ne $null) {
                    $obj.Text = $medicine.dosage
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                }
            } catch {}
            
            try {
                $obj = $bpac.GetObject("frequency$index")
                if ($obj -ne $null) {
                    $obj.Text = $medicine.frequency
                    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($obj) | Out-Null
                }
            } catch {}
            
            $index++
        }
    } catch {}` : ''}
    
    # Execute print
    $printJobName = "Prescription_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    $startPrintResult = $bpac.StartPrint($printJobName, 0)
    
    if ($startPrintResult -eq $true) {
        $printOutResult = $bpac.PrintOut(1, 0)
        $endResult = $bpac.EndPrint()
        
        if ($printOutResult -ne $true) {
            throw "Failed to print label. Please check printer connection."
        }
    } else {
        throw "Failed to start print job. Please check printer settings."
    }
    
    # Close document
    $bpac.Close()
    
    # Release COM object
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    $bpac = $null
    
    $result = @{
        error = $false
        message = "Label printed successfully"
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
}`;

        // Write script with UTF-8 BOM
        const BOM = '\ufeff';
        const tempScriptPath = path.join(__dirname, `temp_print_${Date.now()}.ps1`);
        fs.writeFileSync(tempScriptPath, BOM + scriptContent, 'utf8');

        console.log(`Executing PowerShell with Korean support...`);

        const ps = spawn(powershellPath, [
            '-ExecutionPolicy', 'Bypass',
            '-NoProfile',
            '-File', tempScriptPath
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8'
        });

        ps.stdout.setEncoding('utf8');
        ps.stderr.setEncoding('utf8');

        let stdout = '';
        let stderr = '';

        ps.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ps.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ps.on('close', (code) => {
            // Clean up temp file
            try {
                fs.unlinkSync(tempScriptPath);
            } catch (e) {
                // Ignore cleanup errors
            }

            console.log(`PowerShell process exited with code: ${code}`);
            
            if (code !== 0) {
                const fullError = `PowerShell process exited with code ${code}. Stderr: ${stderr} Stdout: ${stdout}`;
                return reject(new Error(fullError));
            }

            if (stdout.trim() === '') {
                return reject(new Error(`No output from PowerShell script. Stderr: ${stderr}`));
            }

            try {
                // Parse JSON output
                const jsonMatch = stdout.match(/\{.*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    resolve(result);
                } else {
                    throw new Error('No JSON output found');
                }
            } catch (e) {
                console.error('Failed to parse PowerShell output:', stdout);
                reject(new Error(`Failed to parse PowerShell output as JSON: ${e.message}. Output: ${stdout}`));
            }
        });

        ps.on('error', (error) => {
            // Clean up temp file
            try {
                fs.unlinkSync(tempScriptPath);
            } catch (e) {
                // Ignore cleanup errors
            }
            reject(new Error(`Failed to start PowerShell process: ${error.message}`));
        });
    });
}

/**
 * Prints a label using the Brother b-PAC3 SDK via PowerShell.
 * @param {object} data The data to be printed on the label.
 * @param {string} data.templatePath Absolute path to the .lbx template file.
 * @param {string} [data.printerName] The name of the printer to use.
 * @param {string} data.patientName The patient's name.
 * @param {string} data.hospitalName The hospital's name.
 * @param {string} data.receiptDate The receipt date.
 * @param {string} [data.medicationName] The medication name.
 * @param {string} [data.dosage] The dosage information.
 * @param {string} [data.frequency] The frequency information.
 * @returns {Promise<string>} A promise that resolves with a success message.
 */
async function printWithBrother(data) {
    try {
        // 한글 지원을 위해 새로운 방식 사용
        const result = await executePowerShellWithKorean(data);
        
        if (!result.error) {
            // b-PAC 출력 성공
            return { 
                success: true, 
                message: result.message 
            };
        } else {
            // b-PAC 출력 실패 - 에러 발생
            return { 
                success: false, 
                error: result.message 
            };
        }
    } catch (error) {
        console.error('Error in printWithBrother:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

/**
 * Gets a list of available Brother printers
 * @returns {Promise<string[]>} A promise that resolves with a list of printer names.
 */
async function getBrotherPrinters() {
    return new Promise((resolve) => {
        // 한글 지원을 위한 PowerShell 스크립트 생성
        const scriptContent = `
# Get Brother printers
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $printers = Get-WmiObject -Class Win32_Printer | Where-Object { 
        $_.Name -match "Brother" -or $_.DriverName -match "Brother"
    } | Select-Object -ExpandProperty Name
    
    $result = @{
        error = $false
        data = @($printers)
    }
    Write-Output ($result | ConvertTo-Json -Compress)
} catch {
    $result = @{
        error = $true
        message = "Error getting printers: $_"
        data = @()
    }
    Write-Output ($result | ConvertTo-Json -Compress)
}`;

        const BOM = '\ufeff';
        const tempScriptPath = path.join(__dirname, `temp_get_printers_${Date.now()}.ps1`);
        fs.writeFileSync(tempScriptPath, BOM + scriptContent, 'utf8');

        const powershellPath = 'C:\\WINDOWS\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';
        
        const ps = spawn(powershellPath, [
            '-ExecutionPolicy', 'Bypass',
            '-NoProfile',
            '-File', tempScriptPath
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8'
        });

        let stdout = '';
        
        ps.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ps.on('close', () => {
            // Clean up temp file
            try {
                fs.unlinkSync(tempScriptPath);
            } catch (e) {
                // Ignore cleanup errors
            }

            try {
                const jsonMatch = stdout.match(/\{.*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    resolve(result.data || []);
                } else {
                    resolve([]);
                }
            } catch (e) {
                resolve([]);
            }
        });

        ps.on('error', () => {
            // Clean up temp file
            try {
                fs.unlinkSync(tempScriptPath);
            } catch (e) {
                // Ignore cleanup errors
            }
            resolve([]);
        });
    });
}

module.exports = { 
    printWithBrother, 
    getBrotherPrinters
};