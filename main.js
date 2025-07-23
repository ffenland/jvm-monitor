const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { parseFileContent } = require('./parser');
const { printWithBrother, getBrotherPrinters, checkBPacAvailability, diagnoseBPac, findBPacFiles } = require('./print_brother');
const monitorPath = 'C:\\atc'; // Directory to monitor
const dataDirPath = path.join(__dirname, 'result');
const originFilesPath = path.join(__dirname, 'originFiles'); // Directory for original files

let mainWindow;
let currentAvailableDates = new Set(); // To keep track of dates for dynamic updates
let currentConfig = {}; // Store current configuration

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Using a preload script for security
            contextIsolation: true, // Recommended for security
            nodeIntegration: false // Recommended for security
        }
    });

    mainWindow.loadFile('index.html');

    // Open DevTools for debugging
    // mainWindow.webContents.openDevTools();
}

// 설정 파일 읽기/쓰기 함수
function loadConfig() {
    const configPath = path.join(__dirname, 'config', 'config.json');
    try {
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            currentConfig = JSON.parse(configData);
        } else {
            // 기본 설정
            currentConfig = {
                pharmacyName: "",
                templatePath: "./templates/testTemplate.lbx"
            };
            saveConfig(currentConfig);
        }
    } catch (error) {
        console.error('Error loading config:', error);
        currentConfig = {
            pharmacyName: "",
            templatePath: "./templates/testTemplate.lbx"
        };
    }
    return currentConfig;
}

function saveConfig(config) {
    const configPath = path.join(__dirname, 'config', 'config.json');
    const configDir = path.join(__dirname, 'config');
    
    try {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        currentConfig = config;
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
}

// IPC 핸들러 등록

// 설정 관련 핸들러
ipcMain.handle('get-config', async () => {
    return loadConfig();
});

ipcMain.handle('save-config', async (event, config) => {
    try {
        const success = saveConfig(config);
        if (success) {
            return { success: true, message: '설정이 저장되었습니다.' };
        } else {
            return { success: false, error: '설정 저장에 실패했습니다.' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 템플릿 목록 가져오기
ipcMain.handle('get-templates', async () => {
    try {
        const templatesDir = path.join(__dirname, 'templates');
        if (!fs.existsSync(templatesDir)) {
            return { success: true, templates: [] };
        }
        
        const files = fs.readdirSync(templatesDir);
        const templates = files
            .filter(file => file.endsWith('.lbx'))
            .map(file => ({
                name: file,
                path: `./templates/${file}`
            }));
        
        return { success: true, templates };
    } catch (error) {
        console.error('Error getting templates:', error);
        return { success: false, templates: [], error: error.message };
    }
});

// 템플릿 필드 확인
ipcMain.handle('check-template-fields', async (event, templatePath) => {
    try {
        const { executePowerShell } = require('./print_brother');
        let fullPath = templatePath;
        
        // 상대 경로를 절대 경로로 변환
        if (templatePath.startsWith('./')) {
            fullPath = path.join(__dirname, templatePath.substring(2));
        } else if (!path.isAbsolute(templatePath)) {
            fullPath = path.join(__dirname, templatePath);
        }
        
        const result = await executePowerShell('check_template_fields.ps1', { templatePath: fullPath });
        return result;
    } catch (error) {
        console.error('Error checking template fields:', error);
        return { error: true, message: error.message, fields: [] };
    }
});

// 프린터 목록 가져오기
ipcMain.handle('get-brother-printers', async () => {
    try {
        const printers = await getBrotherPrinters();
        return { success: true, printers };
    } catch (error) {
        console.error('Error getting printers:', error);
        return { success: false, error: error.message, printers: [] };
    }
});

// 출력 기능
ipcMain.handle('print-prescription', async (event, prescriptionData, printerName) => {
    try {
        // 템플릿 파일 경로
        const templatePath = path.join(__dirname, 'templates', 'prescription_label.lbx');
        
        const printData = {
            templatePath,
            printerName,
            patientName: prescriptionData.name || prescriptionData.patientName,
            hospitalName: prescriptionData.hos || prescriptionData.hospitalName,
            receiptDate: prescriptionData.recvDate || prescriptionData.receiptDate,
            prepareDate: prescriptionData.prepareDate,
            prescriptionNo: prescriptionData.receiptNo || prescriptionData.medicationNumber,
            doctorName: prescriptionData.doc || prescriptionData.doctorName,
            // 약품 정보 추가
            medicines: prescriptionData.medicines || []
        };
        
        const result = await printWithBrother(printData);
        return { success: true, message: result };
    } catch (error) {
        console.error('Error printing prescription:', error);
        return { success: false, error: error.message };
    }
});

// B-PAC 진단
ipcMain.handle('diagnose-bpac', async () => {
    try {
        const diagnosis = await diagnoseBPac();
        return { success: true, diagnosis };
    } catch (error) {
        console.error('Error diagnosing b-PAC:', error);
        return { success: false, error: error.message };
    }
});

// 약품별 라벨 출력
ipcMain.handle('print-medicine-label', async (event, labelData, printerName) => {
    try {
        // 설정에서 템플릿 경로 가져오기
        const config = loadConfig();
        let templatePath = config.templatePath || './templates/testTemplate.lbx';
        
        // 상대 경로를 절대 경로로 변환
        if (templatePath.startsWith('./')) {
            templatePath = path.join(__dirname, templatePath.substring(2));
        } else if (!path.isAbsolute(templatePath)) {
            templatePath = path.join(__dirname, templatePath);
        }
        
        const printData = {
            templatePath,
            printerName,
            medicineName: labelData.medicineName,
            dailyDose: labelData.dailyDose,
            singleDose: labelData.singleDose,
            prescriptionDays: labelData.prescriptionDays,
            patientName: labelData.patientName,
            date: labelData.date,
            pharmacyName: config.pharmacyName || '',  // 약국명 추가
            // testTemplate.lbx용 필드
            medicine: `${labelData.medicineName} ${labelData.dailyDose}/${labelData.singleDose} ${labelData.prescriptionDays}일분`
        };
        
        const result = await printWithBrother(printData);
        return { success: true, message: result };
    } catch (error) {
        console.error('Error printing medicine label:', error);
        return { success: false, error: error.message };
    }
});

app.whenReady().then(async () => {
    createWindow();
    
    // 설정 파일 로드
    loadConfig();
    
    // Send initial log message to renderer
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('log-message', `Monitoring directory: ${monitorPath}`);
        mainWindow.webContents.send('log-message', `Data will be saved to: ${dataDirPath}`);
        
        // B-PAC 사용 가능 여부 확인 - 비동기로 실행하여 앱 로딩을 블록하지 않음
        setTimeout(async () => {
            try {
                const bpacAvailable = await checkBPacAvailability();
                if (bpacAvailable) {
                    console.log('B-PAC SDK is available');
                    mainWindow.webContents.send('log-message', 'B-PAC SDK is available and ready for use.');
                } else {
                    // B-PAC SDK가 없어도 정상 작동 - 간단히 처리
                    console.log('B-PAC SDK not available, using direct printing method');
                    mainWindow.webContents.send('log-message', 'Brother 프린터 직접 출력 모드로 작동합니다.');
                }
            } catch (error) {
                console.warn('Could not check B-PAC availability:', error.message);
                mainWindow.webContents.send('log-message', `Could not check B-PAC availability: ${error.message}`);
            }
        }, 1000); // 1초 후에 실행
    });

    const watcher = chokidar.watch(monitorPath, {
        persistent: true,
        ignoreInitial: true,
    });

    mainWindow.webContents.send('log-message', `Chokidar watcher initialized for: ${monitorPath}`);

    watcher.on('ready', () => {
        mainWindow.webContents.send('log-message', 'Chokidar: Initial scan complete. Ready for changes.');
    });

    watcher.on('add', (filePath) => {
        mainWindow.webContents.send('log-message', `File added: ${path.basename(filePath)}`);

        fs.readFile(filePath, (err, buffer) => {
            if (err) {
                mainWindow.webContents.send('log-message', `Error reading ${path.basename(filePath)}: ${err.message}`);
                return;
            }

            let parsedContent;
            const fileName = path.basename(filePath);

            try {
                const match = fileName.match(/Copy\d+-(\d{8})(\d{6})\.txt/);
                const preparationDate = match ? match[1] : null;

                parsedContent = parseFileContent(buffer); // Pass buffer to parser

                // Add timestamp and preparationDate to parsedContent for renderer
                const timestamp = Date.now();
                const dataToSend = { ...parsedContent, fileName, preparationDate, timestamp };

                // --- Copy original file to preparation date-specific folder ---
                if (preparationDate) {
                    const dailyOriginPath = path.join(originFilesPath, `origin_${preparationDate}`);
                    if (!fs.existsSync(dailyOriginPath)) {
                        fs.mkdirSync(dailyOriginPath, { recursive: true });
                    }
                    const destPath = path.join(dailyOriginPath, fileName);
                    fs.copyFile(filePath, destPath, (err) => {
                        if (err) {
                            console.error(`Error copying original file: ${err.message}`);
                            mainWindow.webContents.send('log-message', `Error copying original file: ${err.message}`);
                        } else {
                            mainWindow.webContents.send('log-message', `Original file saved to ${path.basename(dailyOriginPath)}.`);
                        }
                    });
                }
                // --- End of copy ---

                mainWindow.webContents.send('log-message', `Content of ${fileName} parsed and stored.`);
                mainWindow.webContents.send('parsed-data', dataToSend); // Send parsed data with fileName, preparationDate, and timestamp
                saveDataToFile(parsedContent, preparationDate); // Save the new data to the appropriate files
            } catch (parseError) {
                const errorMessage = `Error parsing ${fileName}: ${parseError.message}. Moving to error folder.`;
                console.error(errorMessage); // Added console.error
                mainWindow.webContents.send('log-message', errorMessage);

                // Move the problematic file to an error directory
                const errorDirPath = path.join(originFilesPath, 'error');
                if (!fs.existsSync(errorDirPath)) {
                    fs.mkdirSync(errorDirPath, { recursive: true });
                }
                const errorDestPath = path.join(errorDirPath, fileName);
                fs.rename(filePath, errorDestPath, (err) => {
                    if (err) {
                        console.error(`Could not move error file: ${err.message}`); // Added console.error
                        mainWindow.webContents.send('log-message', `Could not move error file: ${err.message}`);
                    }
                });
            }
        });
    });
    

    watcher.on('error', (error) => {
        mainWindow.webContents.send('log-message', `Watcher error: ${error.message}`);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    ipcMain.on('get-initial-data', (event) => {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const todayFilePath = path.join(dataDirPath, `prepare_${today}.json`);
        let todayData = [];
        if (fs.existsSync(todayFilePath)) {
            try {
                todayData = JSON.parse(fs.readFileSync(todayFilePath, 'utf8'));
            } catch (e) { /* ignore */ }
        }

        const availableDates = fs.readdirSync(dataDirPath)
            .filter(file => file.startsWith('prepare_') && file.endsWith('.json'))
            .map(file => file.substring(8, 16)) // 'prepare_'.length, 'prepare_YYYYMMDD'.length
            .sort((a, b) => b.localeCompare(a)); // Sort descending
        
        currentAvailableDates = new Set(availableDates); // Initialize the set of available dates

        event.sender.send('initial-data', { data: todayData, dates: availableDates, today: today });
    });

    ipcMain.on('get-data-for-date', (event, date) => {
        const filePath = path.join(dataDirPath, `prepare_${date}.json`);
        let data = [];
        if (fs.existsSync(filePath)) {
            try {
                data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) { /* ignore */ }
        }
        event.sender.send('data-for-date', data);
    });

    ipcMain.on('get-printers', async (event) => {
    try {
        // B-PAC SDK 확인을 스킵하고 바로 프린터 목록을 가져옴
        mainWindow.webContents.send('log-message', 'Getting Brother printers...');
        
        const printers = await getBrotherPrinters();
        
        if (printers.length === 0) {
            mainWindow.webContents.send('log-message', 'No Brother printers found. Please check if Brother QL-700 is properly installed and connected.');
            event.sender.send('printer-list', {
                error: false,
                message: 'No Brother printers found.',
                printers: []
            });
        } else {
            mainWindow.webContents.send('log-message', `Found ${printers.length} Brother printer(s): ${printers.join(', ')}`);
            event.sender.send('printer-list', {
                error: false,
                message: `Found ${printers.length} Brother printer(s).`,
                printers: printers
            });
        }
    } catch (error) {
        console.error(`Failed to get printers: ${error.message}`);
        mainWindow.webContents.send('log-message', `Failed to get printers: ${error.message}`);
        event.sender.send('printer-list', {
            error: true,
            message: error.message,
            printers: []
        });
    }
});


    ipcMain.on('print-label', async (event, printData) => {
    try {
        // 필수 필드 검증
        if (!printData.templatePath || !fs.existsSync(printData.templatePath)) {
            throw new Error('Template file not found or not specified');
        }

        if (!printData.printerName) {
            throw new Error('Printer name not specified');
        }

        mainWindow.webContents.send('log-message', `Starting print job with printer: ${printData.printerName}`);
        
        const result = await printWithBrother(printData);
        
        mainWindow.webContents.send('log-message', `Print completed successfully: ${result}`);
        event.sender.send('print-label-result', { 
            success: true, 
            message: result 
        });
        
    } catch (error) {
        const errorMessage = `Failed to print: ${error.message}`;
        console.error(errorMessage, error.stack);
        mainWindow.webContents.send('log-message', errorMessage);
        event.sender.send('print-label-result', { 
            success: false, 
            message: errorMessage 
        });
    }
});
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function saveDataToFile(newData, preparationDate) {
    // Save to result_{receiptDate}.json
    if (newData && newData.receiptDateRaw) {
        const receiptDate = newData.receiptDateRaw;
        const resultFilePath = path.join(dataDirPath, `result_${receiptDate}.json`);
        writeDataToDailyFile(resultFilePath, newData);
    } else {
        mainWindow.webContents.send('log-message', 'Error: Cannot save result data without a receipt date.');
    }

    // Save to prepare_{preparationDate}.json
    if (newData && preparationDate) {
        const prepareFilePath = path.join(dataDirPath, `prepare_${preparationDate}.json`);
        const isNewDate = !currentAvailableDates.has(preparationDate); // Check if it's a new date
        
        writeDataToDailyFile(prepareFilePath, newData);

        if (isNewDate) {
            currentAvailableDates.add(preparationDate);
            const updatedDates = Array.from(currentAvailableDates).sort((a, b) => b.localeCompare(a));
            mainWindow.webContents.send('update-date-list', updatedDates);
            mainWindow.webContents.send('log-message', `New date ${preparationDate} added. Updating date list.`);
        }
    } else {
        mainWindow.webContents.send('log-message', 'Error: Cannot save prepare data without a preparation date.');
    }
}

function writeDataToDailyFile(filePath, newData) {
    try {
        // Ensure the directory exists
        if (!fs.existsSync(dataDirPath)) {
            fs.mkdirSync(dataDirPath, { recursive: true });
        }

        let dailyData = [];
        if (fs.existsSync(filePath)) {
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                dailyData = JSON.parse(fileContent);
                if (!Array.isArray(dailyData)) {
                    dailyData = []; // Reset if not an array
                }
            } catch (error) {
                dailyData = []; // Reset on read error
            }
        }

        dailyData.push(newData);

        fs.writeFileSync(filePath, JSON.stringify(dailyData, null, 2), 'utf8');
        mainWindow.webContents.send('log-message', `Data saved successfully to ${path.basename(filePath)}.`);
    } catch (err) {
        mainWindow.webContents.send('log-message', `Error saving data to ${path.basename(filePath)}: ${err.message}`);
    }
}
