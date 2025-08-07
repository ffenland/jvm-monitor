const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { parseFileContent } = require('./parser');
const { printWithBrother, getBrotherPrinters } = require('./print_brother');
const { processLabel1Data, processMedicineLabel, processPrescriptionData } = require('./dataProcessor');
const simpleSecureConfig = require('./simpleSecureConfig');
const drugInfoManager = require('./druginfo');
const monitorPath = 'C:\\atc'; // Directory to monitor
const resultsDirPath = path.join(__dirname, 'data', 'results');
const receiptsDirPath = path.join(__dirname, 'data', 'receipts');
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

// 약품 정보 조회 핸들러
ipcMain.handle('get-medicine-info', async (event, medicineCode) => {
    try {
        const medicineInfo = drugInfoManager.getMedicineInfo(medicineCode);
        return { success: true, medicineInfo };
    } catch (error) {
        console.error('Error getting medicine info:', error);
        return { success: false, error: error.message };
    }
});

// API 키 관리 핸들러 (단순화됨)
ipcMain.handle('set-api-key', async (event, apiKey) => {
    try {
        const success = simpleSecureConfig.setApiKey(apiKey);
        if (success) {
            return { success: true, message: 'API key saved securely' };
        } else {
            return { success: false, error: 'Failed to save API key' };
        }
    } catch (error) {
        console.error('Error saving API key:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-api-key', async () => {
    try {
        const apiKey = simpleSecureConfig.getApiKey();
        if (!apiKey) {
            return { success: false, error: 'No API key found' };
        }
        return { success: true, apiKey };
    } catch (error) {
        console.error('Error getting API key:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-api-key', async () => {
    try {
        const success = simpleSecureConfig.deleteApiKey();
        if (success) {
            return { success: true, message: 'API key deleted' };
        } else {
            return { success: false, error: 'Failed to delete API key' };
        }
    } catch (error) {
        console.error('Error deleting API key:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('has-api-key', async () => {
    try {
        const exists = simpleSecureConfig.hasApiKey();
        return { success: true, exists };
    } catch (error) {
        console.error('Error checking API key:', error);
        return { success: false, error: error.message, exists: false };
    }
});

// 출력 기능
ipcMain.handle('print-prescription', async (event, prescriptionData, printerName) => {
    try {
        // 데이터 가공 - dataProcessor 모듈 사용
        const processedData = processPrescriptionData(prescriptionData);
        
        // 템플릿 파일 경로
        const templatePath = path.join(__dirname, 'templates', 'prescription_label.lbx');
        
        const printData = {
            templatePath,
            printerName,
            ...processedData,  // 가공된 데이터 사용
            // medicines는 JSON 문자열로 변환
            medicines: processedData.medicines ? JSON.stringify(processedData.medicines) : ''
        };
        
        console.log('Processed prescription data:', printData); // 디버깅용
        
        const result = await printWithBrother(printData);
        return { success: true, message: result };
    } catch (error) {
        console.error('Error printing prescription:', error);
        return { success: false, error: error.message };
    }
});

// 약품별 라벨 출력
// 라벨 편집 창 열기
ipcMain.handle('open-label-editor', async (event, prescriptionData, medicineCode) => {
    try {
        // medicine.json에서 약품 정보 가져오기
        const medicineInfo = drugInfoManager.getMedicineInfo(medicineCode);
        
        // 편집 창 생성 - 컴팩트한 크기로 조정
        const editorWindow = new BrowserWindow({
            width: 420,
            height: 550,
            parent: mainWindow,
            modal: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        
        // 데이터를 URL 파라미터로 전달
        const data = {
            prescription: prescriptionData,
            medicineInfo: medicineInfo
        };
        const dataStr = encodeURIComponent(JSON.stringify(data));
        
        editorWindow.loadFile('label-editor.html', {
            query: { data: dataStr }
        });
        
        return { success: true };
    } catch (error) {
        console.error('Error opening label editor:', error);
        return { success: false, error: error.message };
    }
});

// 편집 창에서 출력 요청
ipcMain.handle('print-from-editor', async (event, printData) => {
    try {
        const config = loadConfig();
        
        let templatePath = config.templatePath || './templates/testTemplate.lbx';
        
        // 상대 경로를 절대 경로로 변환
        if (templatePath.startsWith('./')) {
            templatePath = path.join(__dirname, templatePath.substring(2));
        } else if (!path.isAbsolute(templatePath)) {
            templatePath = path.join(__dirname, templatePath);
        }
        
        // 약품 유형 업데이트 체크
        if (printData.updateMedicineType && printData.medicineCode) {
            try {
                // medicine.json 업데이트
                const medicineData = drugInfoManager.loadMedicineData();
                if (medicineData[printData.medicineCode]) {
                    medicineData[printData.medicineCode].mdfsCodeName = [printData.medicineType];
                    // 파일 저장
                    fs.writeFileSync(
                        path.join(__dirname, 'db', 'medicine.json'),
                        JSON.stringify(medicineData, null, 2),
                        'utf8'
                    );
                    console.log(`Updated medicine type for ${printData.medicineCode}: ${printData.medicineType}`);
                }
            } catch (updateError) {
                console.error('Error updating medicine type:', updateError);
                // 업데이트 실패해도 출력은 계속 진행
            }
        }
        
        // 라벨 데이터 가공
        const processedData = {
            patientName: printData.patientName,
            medicineName: printData.medicineInfo?.title || printData.name,
            medicineType: printData.medicineType,
            dose: printData.dosageText,
            prescriptionDays: printData.prescriptionDays + '일분',
            madeDate: `조제일 ${new Date().toLocaleDateString('ko-KR')}`,
            pharmacy: config.pharmacyName
        };
        
        console.log('Processed data for printing:', JSON.stringify(processedData, null, 2));
        
        // Brother 프린터 목록 가져오기
        const printers = await getBrotherPrinters();
        const printerName = printers.length > 0 ? printers[0] : null;
        
        if (!printerName) {
            throw new Error('Brother 프린터를 찾을 수 없습니다.');
        }
        
        const result = await printWithBrother({
            templatePath: templatePath,
            printerName: printerName,
            ...processedData
        });
        
        return result;
    } catch (error) {
        console.error('Error in print-from-editor:', error);
        return { success: false, error: error.message };
    }
});

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
        
        // 템플릿 파일명에 따라 다른 가공 함수 사용
        let processedData;
        const templateFileName = path.basename(templatePath);
        
        if (templateFileName === 'label1.lbx') {
            // label1.lbx용 가공
            processedData = processLabel1Data({
                ...labelData,
                pharmacyName: config.pharmacyName
            });
        } else {
            // 기본 가공
            processedData = processMedicineLabel({
                ...labelData,
                pharmacyName: config.pharmacyName
            });
        }
        
        const printData = {
            templatePath,
            printerName,
            ...processedData  // 가공된 데이터 사용
        };
        
        console.log('Template:', templateFileName);
        console.log('Processed print data:', printData); // 디버깅용
        
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
    
    // API 키 자동 설정 (없을 경우) - 인코딩된 키 사용
    if (!simpleSecureConfig.hasApiKey()) {
        const DEFAULT_API_KEY = 'CO%2B6SC4kgIs5atXW%2FZDETfMu9T87tscntUhZ6cliQKjRsZM4xmiyOEfWFznoUwHkLKteqdM1e4ZpkZEopwBEMg%3D%3D';
        if (simpleSecureConfig.setApiKey(DEFAULT_API_KEY)) {
            console.log('API key initialized successfully');
        } else {
            console.error('Failed to initialize API key');
        }
    } else {
        console.log('API key already exists');
    }
    
    // 오늘 날짜의 result 파일 초기화
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayResultPath = path.join(resultsDirPath, `result_${today}.json`);
    if (!fs.existsSync(todayResultPath)) {
        try {
            if (!fs.existsSync(resultsDirPath)) {
                fs.mkdirSync(resultsDirPath, { recursive: true });
            }
            if (!fs.existsSync(receiptsDirPath)) {
                fs.mkdirSync(receiptsDirPath, { recursive: true });
            }
            fs.writeFileSync(todayResultPath, '[]', 'utf8');
            console.log(`Created today's result file: result_${today}.json`);
        } catch (error) {
            console.error(`Error creating today's result file: ${error.message}`);
        }
    }
    
    // Send initial log message to renderer
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('log-message', `Monitoring directory: ${monitorPath}`);
        mainWindow.webContents.send('log-message', `Data will be saved to: data/results and data/receipts`);
        
        // B-PAC SDK는 이미 작동 확인됨
        setTimeout(() => {
            console.log('B-PAC SDK is ready');
            mainWindow.webContents.send('log-message', 'B-PAC SDK가 준비되었습니다.');
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
                const fileDate = match ? match[1] : null;
                const todayDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

                parsedContent = parseFileContent(buffer); // Pass buffer to parser

                // Add timestamp and todayDate to parsedContent for renderer
                const timestamp = Date.now();
                const dataToSend = { ...parsedContent, fileName, preparationDate: todayDate, timestamp };

                // --- Copy original file to today's date-specific folder ---
                const dailyOriginPath = path.join(originFilesPath, `origin_${todayDate}`);
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
                // --- End of copy ---

                mainWindow.webContents.send('log-message', `Content of ${fileName} parsed and stored.`);
                
                // 먼저 로딩 상태 전송
                mainWindow.webContents.send('parsed-data-loading', {
                    fileName,
                    preparationDate: todayDate,
                    timestamp
                });
                
                // 새로운 형식으로 데이터 준비
                const dataToSave = {
                    patientId: parsedContent.patientId,
                    receiptDateRaw: parsedContent.receiptDateRaw,
                    patientName: parsedContent.patientName,
                    hospitalName: parsedContent.hospitalName,
                    receiptDate: parsedContent.receiptDate,
                    receiptNum: parsedContent.receiptNum,
                    medicines: parsedContent.medicines.map(med => ({
                        code: med.code, // 이미 9자리 코드
                        prescriptionDays: med.prescriptionDays,
                        dailyDose: med.dailyDose,
                        singleDose: med.singleDose
                    }))
                };
                
                // 파일 저장
                saveDataToFile(dataToSave, todayDate);
                
                // 약품 정보 API 호출 (동기적으로 처리)
                if (parsedContent.medicines && parsedContent.medicines.length > 0) {
                    drugInfoManager.processPrescriptionMedicines(parsedContent.medicines)
                        .then(() => {
                            // 더 긴 대기 시간으로 파일 시스템 동기화 보장
                            return new Promise(resolve => setTimeout(resolve, 500));
                        })
                        .then(() => {
                            // medicine.json 정보를 포함한 enriched data 생성
                            const enrichedMedicines = parsedContent.medicines.map(med => {
                                const medicineInfo = drugInfoManager.getMedicineInfo(med.code);
                                console.log(`Medicine code: ${med.code}, Info found: ${medicineInfo ? 'Yes' : 'No'}`);
                                return {
                                    ...med,
                                    medicineInfo: medicineInfo || null
                                };
                            });
                            
                            const enrichedData = {
                                ...parsedContent,
                                medicines: enrichedMedicines,
                                fileName,
                                preparationDate: todayDate,
                                timestamp
                            };
                            
                            // 화면에 업데이트된 데이터 전송
                            mainWindow.webContents.send('parsed-data', enrichedData);
                        })
                        .catch(error => {
                            console.error('Error updating drug info:', error);
                            // 에러 발생 시에도 원본 데이터로 화면 업데이트
                            mainWindow.webContents.send('parsed-data', dataToSend);
                        });
                } else {
                    // 약품이 없는 경우 바로 전송
                    mainWindow.webContents.send('parsed-data', dataToSend);
                }
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
        const todayFilePath = path.join(resultsDirPath, `result_${today}.json`);
        let todayData = [];
        if (fs.existsSync(todayFilePath)) {
            try {
                todayData = JSON.parse(fs.readFileSync(todayFilePath, 'utf8'));
                // 각 데이터의 medicines에 medicineInfo 추가
                todayData = todayData.map(prescription => ({
                    ...prescription,
                    medicines: prescription.medicines.map(med => ({
                        ...med,
                        medicineInfo: drugInfoManager.getMedicineInfo(med.code)
                    }))
                }));
            } catch (e) { /* ignore */ }
        }

        const availableDates = fs.existsSync(resultsDirPath) ? 
            fs.readdirSync(resultsDirPath)
                .filter(file => file.startsWith('result_') && file.endsWith('.json'))
                .map(file => file.substring(7, 15)) // 'result_'.length, 'result_YYYYMMDD'.length
                .sort((a, b) => b.localeCompare(a)) : []; // Sort descending
        
        currentAvailableDates = new Set(availableDates); // Initialize the set of available dates

        event.sender.send('initial-data', { data: todayData, dates: availableDates, today: today });
    });

    ipcMain.on('get-data-for-date', (event, date) => {
        const filePath = path.join(resultsDirPath, `result_${date}.json`);
        let data = [];
        if (fs.existsSync(filePath)) {
            try {
                data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                // 각 데이터의 medicines에 medicineInfo 추가
                data = data.map(prescription => ({
                    ...prescription,
                    medicines: prescription.medicines.map(med => ({
                        ...med,
                        medicineInfo: drugInfoManager.getMedicineInfo(med.code)
                    }))
                }));
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

function saveDataToFile(newData, todayDate) {
    // 1. 오늘날짜의 result_YYYYMMDD.json에 추가
    if (newData && todayDate) {
        const resultFilePath = path.join(resultsDirPath, `result_${todayDate}.json`);
        writeDataToDailyFile(resultFilePath, newData);
        
        // 날짜 목록 업데이트 확인
        const isNewDate = !currentAvailableDates.has(todayDate);
        if (isNewDate) {
            currentAvailableDates.add(todayDate);
            const updatedDates = Array.from(currentAvailableDates).sort((a, b) => b.localeCompare(a));
            mainWindow.webContents.send('update-date-list', updatedDates);
            mainWindow.webContents.send('log-message', `New date ${todayDate} added. Updating date list.`);
        }
    } else {
        mainWindow.webContents.send('log-message', 'Error: Cannot save result data without today date.');
    }
    
    // 2. 접수일자의 receipt_YYYYMMDD.json에 조건부 추가
    if (newData && newData.receiptDateRaw) {
        const receiptFilePath = path.join(receiptsDirPath, `receipt_${newData.receiptDateRaw}.json`);
        writeDataToReceiptFile(receiptFilePath, newData);
    } else {
        mainWindow.webContents.send('log-message', 'Error: Cannot save receipt data without a receipt date.');
    }
}

function writeDataToDailyFile(filePath, newData) {
    try {
        // Ensure the directory exists
        if (!fs.existsSync(resultsDirPath)) {
            fs.mkdirSync(resultsDirPath, { recursive: true });
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

function writeDataToReceiptFile(filePath, newData) {
    try {
        // Ensure the directory exists
        if (!fs.existsSync(receiptsDirPath)) {
            fs.mkdirSync(receiptsDirPath, { recursive: true });
        }

        let receiptData = [];
        if (fs.existsSync(filePath)) {
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                receiptData = JSON.parse(fileContent);
                if (!Array.isArray(receiptData)) {
                    receiptData = []; // Reset if not an array
                }
            } catch (error) {
                receiptData = []; // Reset on read error
            }
        }

        // 동일한 receiptNum과 patientId를 가진 항목들 찾기
        const existingItems = receiptData.filter(item => 
            item.receiptNum === newData.receiptNum && 
            item.patientId === newData.patientId
        );

        if (existingItems.length === 0) {
            // 중복이 없으면 그대로 추가
            receiptData.push(newData);
            fs.writeFileSync(filePath, JSON.stringify(receiptData, null, 2), 'utf8');
            mainWindow.webContents.send('log-message', `Receipt data saved to ${path.basename(filePath)}.`);
        } else {
            // 중복이 있으면 내용이 완전히 동일한지 확인
            const isExactDuplicate = existingItems.some(item => 
                JSON.stringify(item) === JSON.stringify(newData)
            );

            if (isExactDuplicate) {
                // 완전히 동일하면 추가하지 않음
                mainWindow.webContents.send('log-message', `Duplicate receipt data skipped for ${path.basename(filePath)}.`);
            } else {
                // 내용이 다르면 suffix 추가
                let suffix = 1;
                let modifiedReceiptNum = `${newData.receiptNum}-${suffix}`;
                
                // 사용되지 않은 suffix 찾기
                while (receiptData.some(item => item.receiptNum === modifiedReceiptNum)) {
                    suffix++;
                    modifiedReceiptNum = `${newData.receiptNum}-${suffix}`;
                }
                
                // suffix가 추가된 새 데이터 저장
                const modifiedData = { ...newData, receiptNum: modifiedReceiptNum };
                receiptData.push(modifiedData);
                fs.writeFileSync(filePath, JSON.stringify(receiptData, null, 2), 'utf8');
                mainWindow.webContents.send('log-message', `Receipt data saved with suffix: ${modifiedReceiptNum} to ${path.basename(filePath)}.`);
            }
        }
    } catch (err) {
        mainWindow.webContents.send('log-message', `Error saving receipt data to ${path.basename(filePath)}: ${err.message}`);
    }
}
