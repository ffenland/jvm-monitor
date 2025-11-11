const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

/**
 * PowerShell 실행 파일 경로를 동적으로 찾는 함수
 * @returns {string} PowerShell 실행 파일 경로
 */
function getPowerShellPath() {
    // 가능한 PowerShell 경로들 (우선순위 순)
    const possiblePaths = [
        'C:\\WINDOWS\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',  // 32비트 (b-PAC용)
        'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',  // 64비트
        'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',  // 대소문자 다른 경우
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'   // 대소문자 다른 경우
    ];
    
    // 각 경로를 순차적으로 확인
    for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
            console.log(`PowerShell found at: ${path}`);
            return path;
        }
    }
    
    // 모든 경로에서 찾지 못한 경우 시스템 PATH에서 검색
    console.log('Using system PATH for PowerShell');
    return 'powershell';
}

/**
 * PowerShell 스크립트를 실행하는 헬퍼 함수 (한글 지원)
 * @param {object} params Parameters to embed in the script
 * @returns {Promise<object>} A promise that resolves with the result
 */
async function executePowerShellWithKorean(params = {}) {
    return new Promise((resolve, reject) => {
        // PowerShell 실행 경로 동적으로 찾기
        const powershellPath = getPowerShellPath();
        
        // Generate PowerShell script with embedded Korean text
        const scriptContent = `
# Auto-generated PowerShell script for Korean printing
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    # Create b-PAC COM object
    $bpac = New-Object -ComObject "bpac.Document"
    
    # Open template - normalize path
    $templatePath = "${params.templatePath.replace(/\\/g, '/')}"
    Write-Host "Template path: $templatePath"
    
    # Convert forward slashes back to backslashes for Windows
    $templatePath = $templatePath -replace '/', '\\'
    
    # Check if file exists
    if (-not (Test-Path $templatePath)) {
        throw "Template file does not exist: $templatePath"
    }
    
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
        let tempDir;
        try {
            const DatabaseManager = require('./database');
            tempDir = DatabaseManager.getTempDir();
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
        } catch (e) {
            tempDir = __dirname;
        }
        const tempScriptPath = path.join(tempDir, `temp_print_${Date.now()}.ps1`);
        fs.writeFileSync(tempScriptPath, BOM + scriptContent, 'utf8');


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
                logger.error('PowerShell 출력 파싱 실패', {
                    category: 'print',
                    error: e,
                    details: { stdout: stdout.substring(0, 500) }
                });
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
        // 템플릿 파일 존재 여부 확인
        if (!data.templatePath) {
            return {
                success: false,
                error: '템플릿 파일 경로가 지정되지 않았습니다.'
            };
        }
        
        // 템플릿 파일이 실제로 존재하는지 확인
        if (!fs.existsSync(data.templatePath)) {
            logger.error('템플릿 파일 없음', {
                category: 'print',
                error: new Error('Template file not found'),
                details: { templatePath: data.templatePath }
            });
            return {
                success: false,
                error: `템플릿 파일을 찾을 수 없습니다: ${data.templatePath}`
            };
        }
        
        console.log('Using template:', data.templatePath);
        
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
        logger.error('printWithBrother 오류', {
            category: 'print',
            error: error,
            details: { templatePath: data?.templatePath }
        });
        return { 
            success: false, 
            error: error.message 
        };
    }
}

/**
 * Gets a list of available Brother printers using b-PAC SDK
 * @returns {Promise<string[]>} A promise that resolves with a list of printer names.
 */
async function getBrotherPrinters() {
    return new Promise((resolve) => {
        // b-PAC SDK의 GetInstalledPrinters() 메서드를 사용하여 제어 가능한 프린터만 조회
        const scriptContent = `
# Get Brother printers using b-PAC SDK
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    # 1단계: WMI로 모든 Brother 프린터 찾기 (온라인 상태 포함)
    $allPrinters = Get-WmiObject -Class Win32_Printer | Where-Object {
        $_.Name -match "Brother" -or $_.DriverName -match "Brother"
    }

    # 2단계: b-PAC으로 각 프린터를 검증하고 상태 확인
    $validPrinters = @()

    if ($allPrinters.Count -gt 0) {
        foreach ($printer in $allPrinters) {
            try {
                $printerName = $printer.Name

                # b-PAC COM 객체 생성
                $bpac = New-Object -ComObject "bpac.Document"

                # SetPrinter로 프린터 설정 시도
                $result = $bpac.SetPrinter($printerName, $false)

                if ($result -eq $true) {
                    # 프린터 상태 확인
                    # WorkOffline: True이면 오프라인, False이면 온라인
                    # PrinterState: 0=준비됨, 1=일시중지, 2=오류, 3=삭제중, 4=용지걸림 등
                    $isOffline = $printer.WorkOffline
                    $printerState = $printer.PrinterState
                    $printerStatus = $printer.PrinterStatus

                    # 프린터 정보 객체 생성
                    $printerInfo = @{
                        name = $printerName
                        isOffline = $isOffline
                        state = $printerState
                        status = $printerStatus
                    }

                    $validPrinters += $printerInfo
                }

                # COM 객체 정리
                $bpac.Close()
                [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
                $bpac = $null

            } catch {
                # 오류 발생 시 무시
            }
        }
    }

    $result = @{
        error = $false
        data = $validPrinters
    }
    Write-Output ($result | ConvertTo-Json -Compress)

} catch {
    $result = @{
        error = $true
        message = "Error getting printers: $($_.Exception.Message)"
        data = @()
    }
    Write-Output ($result | ConvertTo-Json -Compress)
    exit 1
}`;

        const BOM = '\ufeff';
        let tempDir;
        try {
            const DatabaseManager = require('./database');
            tempDir = DatabaseManager.getTempDir();
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
        } catch (e) {
            tempDir = __dirname;
        }
        const tempScriptPath = path.join(tempDir, `temp_get_printers_${Date.now()}.ps1`);
        fs.writeFileSync(tempScriptPath, BOM + scriptContent, 'utf8');

        const powershellPath = getPowerShellPath();
        
        const ps = spawn(powershellPath, [
            '-ExecutionPolicy', 'Bypass',
            '-NoProfile',
            '-File', tempScriptPath
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8'
        });

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

        ps.on('error', (error) => {
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

/**
 * Preview template as BMP image
 * @param {object} params Parameters for preview
 * @returns {Promise<object>} A promise that resolves with the preview result
 */
async function previewTemplate(params = {}) {
    return new Promise((resolve, reject) => {
        // PowerShell 실행 경로 동적으로 찾기
        const powershellPath = getPowerShellPath();
        
        // 임시 BMP 파일 경로
        let tempDir;
        try {
            const DatabaseManager = require('./database');
            tempDir = DatabaseManager.getTempDir();
        } catch (e) {
            tempDir = path.join(__dirname, 'temp');
        }
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempBmpPath = path.join(tempDir, `preview_${Date.now()}.bmp`);
        
        // PowerShell 스크립트 생성
        const scriptContent = `
# Preview template as BMP
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    # Create b-PAC COM object
    $bpac = New-Object -ComObject "bpac.Document"
    
    # Open template - normalize path
    $templatePath = "${params.templatePath.replace(/\\/g, '/')}"
    Write-Host "Template path: $templatePath"
    
    # Convert forward slashes back to backslashes for Windows
    $templatePath = $templatePath -replace '/', '\\'
    
    # Check if file exists
    if (-not (Test-Path $templatePath)) {
        throw "Template file does not exist: $templatePath"
    }
    
    $openResult = $bpac.Open($templatePath)
    if (-not $openResult) {
        throw "Failed to open template file: $templatePath"
    }
    
    # Set sample text data for preview
    ${Object.entries(params).map(([key, value]) => {
        if (key !== 'templatePath' && value) {
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
    
    # Export as BMP (FileType=4: color BMP, DPI=180)
    $bmpPath = "${tempBmpPath.replace(/\\/g, '\\\\')}"
    $exportResult = $bpac.Export(4, $bmpPath, 180)
    
    if ($exportResult) {
        # Read BMP file and convert to Base64
        $bytes = [System.IO.File]::ReadAllBytes($bmpPath)
        $base64 = [System.Convert]::ToBase64String($bytes)
        
        $result = @{
            error = $false
            message = "Preview generated successfully"
            data = $base64
        }
    } else {
        $result = @{
            error = $true
            message = "Failed to export preview"
            data = ""
        }
    }
    
    # Clean up COM object
    $bpac.Close()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
    
    Write-Output ($result | ConvertTo-Json -Compress)
    
} catch {
    $result = @{
        error = $true
        message = "Error: $_"
        data = ""
    }
    Write-Output ($result | ConvertTo-Json -Compress)
}`;

        // UTF-8 BOM 추가
        const BOM = '\ufeff';
        let tempDirForScript;
        try {
            const { app } = require('electron');
            const appDataDir = path.join(app.getPath('documents'), 'Labelix');
            tempDirForScript = path.join(appDataDir, 'temp');
            if (!fs.existsSync(tempDirForScript)) {
                fs.mkdirSync(tempDirForScript, { recursive: true });
            }
        } catch (e) {
            tempDirForScript = __dirname;
        }
        const tempScriptPath = path.join(tempDirForScript, `temp_preview_${Date.now()}.ps1`);
        fs.writeFileSync(tempScriptPath, BOM + scriptContent, 'utf8');

        // PowerShell 실행
        const ps = spawn(powershellPath, [
            '-ExecutionPolicy', 'Bypass',
            '-NoProfile',
            '-File', tempScriptPath
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8'
        });

        let stdout = '';
        let stderr = '';

        ps.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ps.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ps.on('close', (code) => {
            // Clean up temp files
            try {
                fs.unlinkSync(tempScriptPath);
                if (fs.existsSync(tempBmpPath)) {
                    fs.unlinkSync(tempBmpPath);
                }
            } catch (e) {
                // Ignore cleanup errors
            }

            if (code !== 0) {
                reject(new Error(`PowerShell exited with code ${code}: ${stderr}`));
                return;
            }

            try {
                const jsonMatch = stdout.match(/\{.*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    if (!result.error && result.data) {
                        resolve({
                            success: true,
                            data: result.data
                        });
                    } else {
                        resolve({
                            success: false,
                            error: result.message || 'Preview generation failed'
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        error: 'Invalid response from PowerShell'
                    });
                }
            } catch (e) {
                resolve({
                    success: false,
                    error: e.message
                });
            }
        });

        ps.on('error', (error) => {
            // Clean up temp files
            try {
                fs.unlinkSync(tempScriptPath);
                if (fs.existsSync(tempBmpPath)) {
                    fs.unlinkSync(tempBmpPath);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
            reject(error);
        });
    });
}

module.exports = { 
    printWithBrother, 
    getBrotherPrinters,
    previewTemplate
};