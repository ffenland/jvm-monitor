const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { parseFileContent } = require('./parser');
const { printWithBrother, getBrotherPrinters, previewTemplate } = require('./print_brother');
const { processPrescriptionData } = require('./dataProcessor');
const simpleSecureConfig = require('./simpleSecureConfig');
const drugInfoManager = require('./druginfo');
const DatabaseManager = require('./database');
const { spawn } = require('child_process');
let monitorPath = 'C:\\atc'; // Default directory to monitor (can be changed in config)
let originFilesPath; // Directory for original files - will be set after app.ready

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
    for (const psPath of possiblePaths) {
        if (fs.existsSync(psPath)) {
            console.log(`PowerShell found at: ${psPath}`);
            return psPath;
        }
    }
    
    // 모든 경로에서 찾지 못한 경우 시스템 PATH에서 검색
    console.log('Using system PATH for PowerShell');
    return 'powershell';
}

let mainWindow;
let currentAvailableDates = new Set(); // To keep track of dates for dynamic updates
let currentConfig = {}; // Store current configuration
let watcher = null; // File watcher instance
let dbManager; // Database manager instance

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 800,
        title: 'DrugLabel - PM프로그램 연동 약품 라벨 출력 시스템',
        icon: path.join(__dirname, 'build', 'icon.ico'), // ICO 아이콘 사용
        autoHideMenuBar: true, // 메뉴바 숨기기
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Using a preload script for security
            contextIsolation: true, // Recommended for security
            nodeIntegration: false // Recommended for security
        }
    });

    // 메뉴를 완전히 제거 (Alt 키로도 접근 불가)
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setMenu(null);

    mainWindow.loadFile('index.html');

    // Open DevTools for debugging
    // mainWindow.webContents.openDevTools();
}

// 설정 파일 읽기/쓰기 함수
function loadConfig() {
    const appDataDir = path.join(app.getPath('documents'), 'DrugLabel');
    if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true });
    }
    const configPath = path.join(appDataDir, 'config.json');
    try {
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            currentConfig = JSON.parse(configData);
            // atcPath가 있으면 monitorPath 업데이트
            if (currentConfig.atcPath) {
                monitorPath = currentConfig.atcPath;
                // console.log('ATC path loaded from config:', monitorPath);
            }
        } else {
            // 기본 설정
            const templatesDir = path.join(appDataDir, 'templates');
            
            // 템플릿 폴더가 없으면 생성하고 기본 템플릿 복사
            if (!fs.existsSync(templatesDir)) {
                fs.mkdirSync(templatesDir, { recursive: true });
            }
            
            // 기본 템플릿 경로
            const defaultTemplatePath = path.join(templatesDir, 'default.lbx');
            
            // 기본 템플릿이 없으면 app 폴더에서 복사 시도
            if (!fs.existsSync(defaultTemplatePath)) {
                const sourceTemplate = path.join(__dirname, 'templates', 'default.lbx');
                if (fs.existsSync(sourceTemplate)) {
                    fs.copyFileSync(sourceTemplate, defaultTemplatePath);
                }
            }
            
            currentConfig = {
                pharmacyName: "",
                templatePath: defaultTemplatePath,
                atcPath: "C:\\atc",
                isFirstRun: true  // 첫 실행 플래그
            };
            saveConfig(currentConfig);
        }
    } catch (error) {
        console.error('Error loading config:', error);
        const templatesDir = path.join(appDataDir, 'templates');
        
        // 템플릿 폴더가 없으면 생성
        if (!fs.existsSync(templatesDir)) {
            fs.mkdirSync(templatesDir, { recursive: true });
        }
        
        const defaultTemplatePath = path.join(templatesDir, 'default.lbx');
        
        // 기본 템플릿이 없으면 app 폴더에서 복사 시도
        if (!fs.existsSync(defaultTemplatePath)) {
            const sourceTemplate = path.join(__dirname, 'templates', 'default.lbx');
            if (fs.existsSync(sourceTemplate)) {
                fs.copyFileSync(sourceTemplate, defaultTemplatePath);
            }
        }
        
        currentConfig = {
            pharmacyName: "",
            templatePath: defaultTemplatePath,
            atcPath: "C:\\atc",
            isFirstRun: true
        };
    }
    return currentConfig;
}

function saveConfig(config) {
    const appDataDir = path.join(app.getPath('documents'), 'DrugLabel');
    const configPath = path.join(appDataDir, 'config.json');
    
    try {
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
ipcMain.handle('open-external', async (event, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
    return { success: true };
});

ipcMain.handle('get-config', async () => {
    return loadConfig();
});

ipcMain.handle('check-first-run', async () => {
    const config = loadConfig();
    // 약국명이 비어있으면 첫 실행으로 간주
    return !config.pharmacyName || config.pharmacyName === "";
});

ipcMain.handle('save-config', async (event, config) => {
    try {
        // atcPath가 변경되었는지 확인
        const oldPath = monitorPath;
        
        // isFirstRun 플래그 제거 (설정을 저장하면 더 이상 첫 실행이 아님)
        if (config.isFirstRun) {
            delete config.isFirstRun;
        }
        
        const success = saveConfig(config);
        
        if (success) {
            // atcPath가 변경되었으면 monitorPath 업데이트 및 파일 감시 재시작
            if (config.atcPath && config.atcPath !== oldPath) {
                monitorPath = config.atcPath;
                console.log('ATC path updated to:', monitorPath);
                
                // 파일 감시 재시작
                if (watcher) {
                    watcher.close();
                }
                startFileWatcher();
            }
            
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
        // Documents\DrugLabel\templates 폴더에서 템플릿 읽기
        const appDataDir = path.join(app.getPath('documents'), 'DrugLabel');
        const templatesDir = path.join(appDataDir, 'templates');
        
        // 템플릿 폴더가 없으면 생성
        if (!fs.existsSync(templatesDir)) {
            fs.mkdirSync(templatesDir, { recursive: true });
            
            // 기본 템플릿을 앱 폴더에서 복사 (첫 실행 시)
            const sourceTemplatesDir = path.join(__dirname, 'templates');
            if (fs.existsSync(sourceTemplatesDir)) {
                const sourceFiles = fs.readdirSync(sourceTemplatesDir);
                sourceFiles.filter(file => file.endsWith('.lbx')).forEach(file => {
                    const sourcePath = path.join(sourceTemplatesDir, file);
                    const targetPath = path.join(templatesDir, file);
                    if (!fs.existsSync(targetPath)) {
                        fs.copyFileSync(sourcePath, targetPath);
                    }
                });
            }
        }
        
        const files = fs.readdirSync(templatesDir);
        const templates = files
            .filter(file => file.endsWith('.lbx'))
            .map(file => ({
                name: file,
                path: path.join(templatesDir, file)
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
        const { spawn } = require('child_process');
        let fullPath = templatePath;
        
        // 상대 경로를 절대 경로로 변환 (템플릿은 이미 절대 경로로 저장됨)
        if (!path.isAbsolute(templatePath)) {
            const appDataDir = path.join(app.getPath('documents'), 'DrugLabel');
            const templatesDir = path.join(appDataDir, 'templates');
            fullPath = path.join(templatesDir, path.basename(templatePath));
        }
        
        // PowerShell 스크립트 경로
        const scriptPath = path.join(__dirname, 'scripts', 'check_template_fields.ps1');
        const powershellPath = getPowerShellPath();
        
        return new Promise((resolve, reject) => {
            const ps = spawn(powershellPath, [
                '-ExecutionPolicy', 'Bypass',
                '-NoProfile',
                '-File', scriptPath,
                '-templatePath', fullPath
            ]);
            
            let stdout = '';
            let stderr = '';
            
            ps.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            ps.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            ps.on('close', (code) => {
                if (code !== 0) {
                    console.error('PowerShell error:', stderr);
                    resolve({ error: true, message: 'Failed to check template fields', fields: [] });
                } else {
                    try {
                        const jsonMatch = stdout.match(/\{.*\}/);
                        if (jsonMatch) {
                            const result = JSON.parse(jsonMatch[0]);
                            resolve(result);
                        } else {
                            resolve({ error: true, message: 'No output from script', fields: [] });
                        }
                    } catch (e) {
                        console.error('Failed to parse output:', e);
                        resolve({ error: true, message: 'Failed to parse output', fields: [] });
                    }
                }
            });
            
            ps.on('error', (error) => {
                console.error('Failed to start PowerShell:', error);
                resolve({ error: true, message: error.message, fields: [] });
            });
        });
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

// 템플릿 미리보기
ipcMain.handle('preview-template', async (event, templatePath) => {
    try {
        // 상대 경로를 절대 경로로 변환 (템플릿은 이미 절대 경로로 저장됨)
        let fullPath = templatePath;
        if (!path.isAbsolute(templatePath)) {
            const appDataDir = path.join(app.getPath('documents'), 'DrugLabel');
            const templatesDir = path.join(appDataDir, 'templates');
            fullPath = path.join(templatesDir, path.basename(templatePath));
        }
        
        // 샘플 데이터로 미리보기 생성
        const config = loadConfig();
        const sampleData = {
            templatePath: fullPath,
            patientName: '홍길동',
            medicineName: '시크렌캡슐',
            medicineType: '먹는약',
            dose: '2알씩 하루 3번 복용',
            prescriptionDays: '7일분',
            madeDate: `조제일 ${new Date().toLocaleDateString('ko-KR')}`,
            pharmacy: config.pharmacyName || '약국명'
        };
        
        const result = await previewTemplate(sampleData);
        return result;
    } catch (error) {
        console.error('Error previewing template:', error);
        return { success: false, error: error.message };
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

// 폴더 선택 다이얼로그
ipcMain.handle('select-folder', async (event, defaultPath) => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'ATC 서버 경로 선택',
            defaultPath: defaultPath || 'C:\\atc',
            properties: ['openDirectory'],
            buttonLabel: '폴더 선택'
        });
        
        if (result.canceled) {
            return { success: false, canceled: true };
        }
        
        return { success: true, folderPath: result.filePaths[0] };
    } catch (error) {
        console.error('Error selecting folder:', error);
        return { success: false, error: error.message };
    }
});

// 출력 기능
ipcMain.handle('print-prescription', async (event, prescriptionData, printerName) => {
    try {
        // 데이터 가공 - dataProcessor 모듈 사용
        const processedData = processPrescriptionData(prescriptionData);
        
        // 템플릿 파일 경로 (Documents\DrugLabel\templates)
        const appDataDir = path.join(app.getPath('documents'), 'DrugLabel');
        const templatePath = path.join(appDataDir, 'templates', 'prescription_label.lbx');
        
        const printData = {
            templatePath,
            printerName,
            ...processedData,  // 가공된 데이터 사용
            // medicines는 JSON 문자열로 변환
            medicines: processedData.medicines ? JSON.stringify(processedData.medicines) : ''
        };
        
        
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
        
        // 편집 창 생성 - 스크롤 없이 볼 수 있도록 높이 조정
        const editorWindow = new BrowserWindow({
            width: 420,
            height: 900,
            parent: mainWindow,
            modal: true,
            icon: path.join(__dirname, 'build', 'icon.ico'), // 아이콘 설정
            autoHideMenuBar: true, // 메뉴바 숨기기
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        
        // 메뉴를 완전히 제거 (Alt 키로도 접근 불가)
        editorWindow.setMenuBarVisibility(false);
        editorWindow.setMenu(null);
        
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
        
        let templatePath = config.templatePath;
        
        // templatePath가 없거나 존재하지 않는 경우 기본 템플릿 사용
        if (!templatePath || !fs.existsSync(templatePath)) {
            const appDataDir = path.join(app.getPath('documents'), 'DrugLabel');
            const templatesDir = path.join(appDataDir, 'templates');
            templatePath = path.join(templatesDir, 'default.lbx');
        }
        
        // 약품 정보 업데이트 체크 (SQLite DB 사용)
        if ((printData.updateMedicineType || printData.updateMedicineName) && printData.medicineCode) {
            try {
                const db = drugInfoManager.db;
                const existingMedicine = db.getMedicine(printData.medicineCode);
                
                if (existingMedicine) {
                    const updatedData = { ...existingMedicine };
                    
                    // 약품 유형 업데이트
                    if (printData.updateMedicineType) {
                        updatedData.mdfsCodeName = printData.medicineType;
                    }
                    
                    // 약품명 업데이트
                    if (printData.updateMedicineName && printData.name) {
                        updatedData.title = printData.name;
                    }
                    
                    // DB에 저장
                    db.saveMedicine(updatedData);
                }
            } catch (updateError) {
                console.error('Error updating medicine info in DB:', updateError);
                // 업데이트 실패해도 출력은 계속 진행
            }
        }
        
        // 라벨 데이터 가공
        // 필요한 값들 추출
        const singleDose = parseInt(printData.singleDose) || 0;
        const dailyDose = parseInt(printData.dailyDose) || 0;
        const prescriptionDays = parseInt(printData.prescriptionDays) || 0;
        const unit = printData.medicineInfo?.unit || '정';
        const storageTemp = printData.medicineInfo?.storageTemp || '';
        
        const processedData = {
            patientName: printData.patientName,
            medicineName: `[${printData.medicineInfo?.title || printData.name}]`,
            medicineType: printData.medicineType,
            dose: printData.dosageText,
            prescriptionDays: printData.prescriptionDays + '일분',
            madeDate: `조제일 ${new Date().toLocaleDateString('ko-KR')}`,
            pharmacy: config.pharmacyName,
            totalCount: `총${singleDose * dailyDose * prescriptionDays}${unit}`,
            storageTemp: storageTemp
        };
        
        
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

// medicine.json 목록 조회
ipcMain.handle('get-medicine-list', async () => {
    try {
        const medicineJsonPath = path.join(__dirname, 'db', 'medicine.json');
        if (fs.existsSync(medicineJsonPath)) {
            const content = fs.readFileSync(medicineJsonPath, 'utf8');
            return JSON.parse(content);
        }
        return [];
    } catch (error) {
        console.error('medicine.json 읽기 실패:', error);
        return [];
    }
});

// 약품 검색
ipcMain.handle('search-medicine', async (event, searchTerm) => {
    try {
        const medicines = dbManager.db.prepare(`
            SELECT * FROM medicines 
            WHERE code LIKE ? OR title LIKE ? 
            LIMIT 50
        `).all(`%${searchTerm}%`, `%${searchTerm}%`);
        
        return { success: true, medicines };
    } catch (error) {
        console.error('약품 검색 실패:', error);
        return { success: false, error: error.message, medicines: [] };
    }
});

// 단일 약품 정보 조회
ipcMain.handle('get-single-medicine', async (event, code) => {
    try {
        const medicine = dbManager.getMedicine(code);
        return { success: true, medicine };
    } catch (error) {
        console.error('약품 조회 실패:', error);
        return { success: false, error: error.message };
    }
});

// 약품 상세정보 조회 (모달용)
ipcMain.handle('get-medicine-detail', async (event, code) => {
    try {
        const medicine = dbManager.getMedicine(code);
        if (!medicine) {
            return { success: false, error: '약품 정보를 찾을 수 없습니다.' };
        }
        return { success: true, medicine };
    } catch (error) {
        console.error('약품 상세정보 조회 실패:', error);
        return { success: false, error: error.message };
    }
});

// 약품 정보 업데이트
ipcMain.handle('update-medicine', async (event, medicineData) => {
    try {
        // 데이터베이스 업데이트
        const stmt = dbManager.db.prepare(`
            UPDATE medicines 
            SET title = ?, type = ?, mdfsCodeName = ?, unit = ?, storageTemp = ?, storageContainer = ?, autoPrint = ?
            WHERE code = ?
        `);
        
        stmt.run(
            medicineData.title,
            medicineData.type,
            medicineData.mdfsCodeName,  // 효능 필드
            medicineData.unit,
            medicineData.storageTemp,
            medicineData.storageContainer,
            medicineData.autoPrint ? 1 : 0,
            medicineData.code
        );
        
        // 약품 정보가 성공적으로 업데이트되면 medicine_fails에서 삭제
        dbManager.deleteMedicineFail(medicineData.code);
        
        return { success: true, message: '약품 정보가 업데이트되었습니다.' };
    } catch (error) {
        console.error('약품 업데이트 실패:', error);
        return { success: false, error: error.message };
    }
});

// 실패한 약품 목록 조회
ipcMain.handle('get-medicine-fails', async () => {
    try {
        const fails = dbManager.getAllMedicineFails();
        return { success: true, data: fails };
    } catch (error) {
        console.error('실패 약품 목록 조회 실패:', error);
        return { success: false, error: error.message };
    }
});

// 실패한 약품 개수 조회
ipcMain.handle('get-medicine-fail-count', async () => {
    try {
        const count = dbManager.getMedicineFailCount();
        return { success: true, count };
    } catch (error) {
        console.error('실패 약품 개수 조회 실패:', error);
        return { success: false, count: 0 };
    }
});

// 약품 정보 자동 입력 (API 재요청)
ipcMain.handle('auto-fill-medicine', async (event, medicineCode) => {
    try {
        const drugInfoManager = require('./druginfo');
        
        // 약품명 찾기: medicine_fails 또는 medicines 테이블에서 조회
        let medicineName = '';
        const failedMedicine = dbManager.getMedicineFail(medicineCode);
        
        if (failedMedicine) {
            // 실패 목록에 있으면 그 정보 사용
            medicineName = failedMedicine.name;
        } else {
            // 실패 목록에 없으면 medicines 테이블에서 조회
            const existingMedicine = dbManager.getMedicine(medicineCode);
            if (existingMedicine) {
                medicineName = existingMedicine.title;
            }
        }
        
        // API로 약품 정보 조회 시도 (forceUpdate=true로 강제 업데이트)
        const medicines = [{
            code: medicineCode,
            name: medicineName || `약품코드 ${medicineCode}`
        }];
        
        await drugInfoManager.processPrescriptionMedicines(medicines, true);
        
        // 성공적으로 처리되었는지 확인
        const updatedMedicine = dbManager.getMedicine(medicineCode);
        if (updatedMedicine && updatedMedicine.api_fetched === 1) {
            // 성공했고 medicine_fails에 있었다면 삭제
            if (failedMedicine) {
                dbManager.deleteMedicineFail(medicineCode);
            }
            return { 
                success: true, 
                message: '정상적으로 저장했습니다.',
                medicine: updatedMedicine 
            };
        } else {
            return { 
                success: false, 
                error: '자동 입력에 실패했습니다. 직접 입력하던가 나중에 다시 시도하세요.' 
            };
        }
    } catch (error) {
        console.error('약품 자동 입력 실패:', error);
        return { 
            success: false, 
            error: '자동 입력에 실패했습니다. 직접 입력하던가 나중에 다시 시도하세요.' 
        };
    }
});


app.whenReady().then(async () => {
    // originFiles 경로 설정 (현재 작업 디렉토리 사용)
    originFilesPath = path.join(__dirname, 'originFiles');
    if (!fs.existsSync(originFilesPath)) {
        fs.mkdirSync(originFilesPath, { recursive: true });
    }
    
    createWindow();
    
    // 데이터베이스 초기화
    dbManager = new DatabaseManager();
    
    // 설정 파일 로드
    const config = loadConfig();
    
    // 첫 실행 확인 (약국명이 비어있으면 첫 실행으로 간주)
    if (!config.pharmacyName || config.pharmacyName === "") {
        // 첫 실행 시 설정 창 자동 표시
        setTimeout(() => {
            if (mainWindow) {
                mainWindow.webContents.send('show-initial-setup');
            }
        }, 1000); // 창이 완전히 로드된 후 표시
    }
    
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
    
    // Send initial log message to renderer
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('log-message', `Monitoring directory: ${monitorPath}`);
        mainWindow.webContents.send('log-message', `Data will be saved to SQLite database`);
        
        // B-PAC SDK는 이미 작동 확인됨
        setTimeout(() => {
            console.log('B-PAC SDK is ready');
            mainWindow.webContents.send('log-message', 'B-PAC SDK가 준비되었습니다.');
            // b-PAC 설치 확인
            checkBpacInstallation();
        }, 1000); // 1초 후에 실행
    });

    // 파일 감시 시작
    startFileWatcher();
});

// 파일 감시 시작 함수
function startFileWatcher() {
    if (!mainWindow) return;
    
    // 기존 watcher가 있으면 종료
    if (watcher) {
        watcher.close();
    }
    
    watcher = chokidar.watch(monitorPath, {
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
                
                // 약품 정보를 먼저 API로 가져오고 저장 (동기적으로 처리)
                if (parsedContent.medicines && parsedContent.medicines.length > 0) {
                    drugInfoManager.processPrescriptionMedicines(parsedContent.medicines)
                        .then((result) => {
                            // API 호출이 있었을 때만 대기
                            if (result && result.apiCallCount > 0) {
                                return new Promise(resolve => setTimeout(() => resolve(result), 100));
                            } else {
                                return Promise.resolve(result);
                            }
                        })
                        .then(async (result) => {
                            // 약품 정보가 모두 저장된 후에 파일 저장
                            saveDataToFile(dataToSave, todayDate, filePath);
                            
                            // medicine.json 정보를 포함한 enriched data 생성
                            const enrichedMedicines = parsedContent.medicines.map(med => {
                                const medicineInfo = drugInfoManager.getMedicineInfo(med.code);
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
                            
                            // 자동 출력 확인 및 처리
                            const autoPrintMedicines = [];
                            for (const med of parsedContent.medicines) {
                                const medicineInfo = dbManager.getMedicine(med.code);
                                if (medicineInfo && medicineInfo.autoPrint) {
                                    autoPrintMedicines.push({
                                        ...med,
                                        medicineInfo
                                    });
                                }
                            }
                            
                            // 자동 출력할 약품이 있으면 출력
                            if (autoPrintMedicines.length > 0) {
                                mainWindow.webContents.send('log-message', `자동 출력 약품 ${autoPrintMedicines.length}개 발견`);
                                
                                // 프린터 목록 가져오기
                                const printers = await getBrotherPrinters();
                                const printerName = printers.length > 0 ? printers[0] : null;
                                
                                if (printerName) {
                                    for (const medicine of autoPrintMedicines) {
                                        const printData = {
                                            patientName: parsedContent.patientName,
                                            patientId: parsedContent.patientId,
                                            receiptNum: parsedContent.receiptNum,
                                            receiptDate: parsedContent.receiptDate,
                                            hospitalName: parsedContent.hospitalName,
                                            name: medicine.medicineInfo.title,
                                            code: medicine.code,
                                            prescriptionDays: medicine.prescriptionDays,
                                            dailyDose: medicine.dailyDose,
                                            singleDose: medicine.singleDose,
                                            medicineInfo: medicine.medicineInfo
                                        };
                                        
                                        try {
                                            const config = loadConfig();
                                            let templatePath = config.templatePath;
                                            
                                            // templatePath가 없거나 존재하지 않는 경우 기본 템플릿 사용
                                            if (!templatePath || !fs.existsSync(templatePath)) {
                                                const appDataDir = path.join(app.getPath('documents'), 'DrugLabel');
                                                const templatesDir = path.join(appDataDir, 'templates');
                                                templatePath = path.join(templatesDir, 'default.lbx');
                                            }
                                            
                                            // 라벨 데이터 가공
                                            const singleDoseVal = parseInt(printData.singleDose) || 0;
                                            const dailyDoseVal = parseInt(printData.dailyDose) || 0;
                                            const prescriptionDaysVal = parseInt(printData.prescriptionDays) || 0;
                                            const unit = printData.medicineInfo?.unit || '정';
                                            const storageTemp = printData.medicineInfo?.storageTemp || '';
                                            
                                            const processedData = {
                                                patientName: printData.patientName,
                                                medicineName: `[${printData.medicineInfo?.title || printData.name}]`,
                                                medicineType: printData.medicineInfo?.mdfsCodeName || '약품',
                                                dose: `${singleDoseVal}${unit}씩 하루 ${dailyDoseVal}번`,
                                                prescriptionDays: printData.prescriptionDays + '일분',
                                                madeDate: `조제일 ${new Date().toLocaleDateString('ko-KR')}`,
                                                pharmacy: config.pharmacyName,
                                                totalCount: `총${singleDoseVal * dailyDoseVal * prescriptionDaysVal}${unit}`,
                                                storageTemp: storageTemp
                                            };
                                            
                                            const result = await printWithBrother({
                                                templatePath: templatePath,
                                                printerName: printerName,
                                                ...processedData
                                            });
                                            
                                            mainWindow.webContents.send('log-message', `${printData.name} 자동 출력 완료`);
                                        } catch (printError) {
                                            console.error('자동 출력 실패:', printError);
                                            mainWindow.webContents.send('log-message', `${printData.name} 자동 출력 실패: ${printError.message}`);
                                        }
                                    }
                                }
                            }
                        })
                        .catch(error => {
                            console.error('Error updating drug info:', error);
                            // 에러 발생 시에도 파일 저장 시도
                            saveDataToFile(dataToSave, todayDate, filePath);
                            // 원본 데이터로 화면 업데이트
                            mainWindow.webContents.send('parsed-data', dataToSend);
                        });
                } else {
                    // 약품이 없는 경우 바로 저장 및 전송
                    saveDataToFile(dataToSave, todayDate, filePath);
                    mainWindow.webContents.send('parsed-data', dataToSend);
                }
            } catch (parseError) {
                // Move the problematic file to an error/original directory
                const errorDirPath = path.join(originFilesPath, 'error', 'original');
                if (!fs.existsSync(errorDirPath)) {
                    fs.mkdirSync(errorDirPath, { recursive: true });
                }
                
                // Add timestamp to filename to prevent conflicts
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const errorFileName = `${timestamp}_${fileName}`;
                const errorDestPath = path.join(errorDirPath, errorFileName);
                
                // Create error message with file path
                const errorMessage = `Error parsing ${fileName}: ${parseError.message}\n원본 파일 위치: error/original/${errorFileName}`;
                console.error(errorMessage);
                mainWindow.webContents.send('log-message', errorMessage);
                
                // Move file to error directory
                fs.rename(filePath, errorDestPath, (err) => {
                    if (err) {
                        console.error(`Could not move error file: ${err.message}`);
                        mainWindow.webContents.send('log-message', `Could not move error file: ${err.message}`);
                    } else {
                        console.log(`Error file moved to: ${errorDestPath}`);
                    }
                });
            }
        });
    });
    

    watcher.on('error', (error) => {
        mainWindow.webContents.send('log-message', `Watcher error: ${error.message}`);
    });
}

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.on('get-initial-data', (event) => {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        // 데이터베이스에서 오늘 날짜의 처방전 가져오기
        const todayPrescriptions = dbManager.getPrescriptionsByDate(today);
        
        // medicine 정보 추가 및 timestamp 추가
        const todayData = todayPrescriptions.map((prescription, index) => ({
            patientId: prescription.patientId,
            receiptNum: prescription.receiptNum,
            receiptDateRaw: prescription.receiptDateRaw,
            receiptDate: prescription.receiptDate,  // receiptDate 추가
            patientName: prescription.patientName,
            hospitalName: prescription.hospitalName,
            medicines: prescription.medicines.map(med => ({
                ...med,
                medicineInfo: dbManager.getMedicine(med.code) || drugInfoManager.getMedicineInfo(med.code)
            })),
            timestamp: prescription.createdAt ? new Date(prescription.createdAt).getTime() : Date.now() - (1000 * index) // timestamp 추가
        }));

        // 사용 가능한 날짜 목록 가져오기 (DB에서만)
        const dbDatesQuery = dbManager.db.prepare('SELECT DISTINCT receiptDateRaw FROM prescriptions ORDER BY receiptDateRaw DESC').all();
        let allDates = dbDatesQuery.map(row => row.receiptDateRaw);
        
        // 오늘 날짜가 목록에 없으면 추가 (항상 첫 번째 위치에)
        if (!allDates.includes(today)) {
            allDates.unshift(today);
        } else {
            // 오늘 날짜가 있으면 첫 번째 위치로 이동
            allDates = allDates.filter(date => date !== today);
            allDates.unshift(today);
        }
        
        currentAvailableDates = new Set(allDates);

        // 오늘 날짜의 데이터가 없어도 오늘 날짜를 선택하고 빈 배열 전송
        event.sender.send('initial-data', { data: todayData, dates: allDates, today: today });
    });

ipcMain.on('get-data-for-date', (event, date) => {
        // 데이터베이스에서 데이터 가져오기
        const dbData = dbManager.getPrescriptionsByDate(date);
        
        // 데이터베이스에서 가져온 데이터에 medicine 정보 추가
        const data = dbData.map(prescription => ({
            ...prescription,
            receiptDate: prescription.receiptDate,  // receiptDate 명시적으로 포함
            medicines: prescription.medicines.map(med => ({
                ...med,
                medicineInfo: dbManager.getMedicine(med.code) || drugInfoManager.getMedicineInfo(med.code)
            }))
        }));
        
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

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function saveDataToFile(newData, todayDate, sourceFilePath = null) {
    // 원본 파일 백업 (sourceFilePath가 있는 경우)
    if (sourceFilePath && fs.existsSync(sourceFilePath)) {
        try {
            // 오늘 날짜로 폴더 생성 (YYYYMMDD 형식)
            const today = new Date();
            const dateFolder = `origin_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
            const backupDir = path.join(originFilesPath, dateFolder);
            
            // 백업 디렉토리가 없으면 생성
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
                mainWindow.webContents.send('log-message', `Created backup directory: ${dateFolder}`);
            }
            
            // 원본 파일명 가져오기
            const originalFileName = path.basename(sourceFilePath);
            const backupPath = path.join(backupDir, originalFileName);
            
            // 파일 복사
            fs.copyFileSync(sourceFilePath, backupPath);
            mainWindow.webContents.send('log-message', `Original file backed up to: ${dateFolder}/${originalFileName}`);
            
        } catch (backupError) {
            console.error('Error backing up file:', backupError);
            mainWindow.webContents.send('log-message', `Warning: Could not backup original file: ${backupError.message}`);
        }
    }
    
    // SQLite 데이터베이스에 저장
    if (newData && newData.receiptDateRaw) {
        try {
            // 처방전 데이터를 데이터베이스에 저장 (원본 파일 경로와 함께)
            const result = dbManager.savePrescription(newData, sourceFilePath);
            
            if (result.success) {
                mainWindow.webContents.send('log-message', `Data saved successfully to database.`);
            } else if (result.message === 'Prescription already exists') {
                mainWindow.webContents.send('log-message', `Prescription already exists (Receipt: ${newData.receiptNum}, Patient: ${newData.patientName})`);
            }
            
            // 날짜 목록 업데이트 확인
            const isNewDate = !currentAvailableDates.has(todayDate);
            if (isNewDate) {
                currentAvailableDates.add(todayDate);
                // 오늘 날짜를 항상 첫 번째로 유지
                let updatedDates = Array.from(currentAvailableDates).sort((a, b) => b.localeCompare(a));
                const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                if (updatedDates.includes(today)) {
                    updatedDates = updatedDates.filter(date => date !== today);
                    updatedDates.unshift(today);
                }
                mainWindow.webContents.send('update-date-list', updatedDates);
                mainWindow.webContents.send('log-message', `New date ${todayDate} added. Updating date list.`);
            }
        } catch (error) {
            console.error('Error saving to database:', error);
            mainWindow.webContents.send('log-message', `Error saving to database: ${error.message}`);
        }
    } else {
        mainWindow.webContents.send('log-message', 'Error: Cannot save data without a receipt date.');
    }
}

/**
 * b-PAC 설치 확인 및 안내
 */
async function checkBpacInstallation() {
    const { spawn } = require('child_process');
    const { shell } = require('electron');
    
    // 더 많은 COM 객체 이름 시도
    const checkScript = `
    $comNames = @(
        "bpac.Document",
        "b-PAC.Document", 
        "bpac3.Document",
        "Brother.bpac.Document",
        "BrssCom.Document"
    )
    
    $found = $false
    foreach ($comName in $comNames) {
        try {
            $bpac = New-Object -ComObject $comName -ErrorAction Stop
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($bpac) | Out-Null
            Write-Output "OK:$comName"
            $found = $true
            break
        } catch {
            # Continue to next COM name
        }
    }
    
    if (-not $found) {
        Write-Output "NOT_FOUND"
    }`;
    
    const powershellPath = getPowerShellPath();
    console.log('Checking b-PAC installation with PowerShell:', powershellPath);
    
    // spawn 사용으로 변경
    const ps = spawn(powershellPath, [
        '-ExecutionPolicy', 'Bypass',
        '-NoProfile', 
        '-Command', checkScript
    ]);
    
    let stdout = '';
    let stderr = '';
    
    ps.stdout.on('data', (data) => {
        stdout += data.toString();
    });
    
    ps.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    ps.on('close', async (code) => {
        const result = stdout.trim();
        console.log('b-PAC check result:', result);
        console.log('b-PAC check stderr:', stderr);
        
        if (result.startsWith('OK:')) {
            // b-PAC이 설치되어 있음
            const comName = result.split(':')[1];
            console.log(`b-PAC is installed (COM: ${comName})`);
            mainWindow.webContents.send('bpac-status', { installed: true });
            mainWindow.webContents.send('log-message', `b-PAC COM 객체 확인됨: ${comName}`);
        } else {
            // b-PAC이 설치되지 않음
            console.log('b-PAC not installed, showing installation guide');
            
            // b-PAC이 설치되지 않은 경우 안내 다이얼로그 표시
            const { response } = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Brother b-PAC 구성 요소 필요',
                message: 'DrugLabel을 사용하려면 Brother b-PAC Client Component가 필요합니다.',
                detail: '라벨 출력 기능을 사용하려면 Brother b-PAC Client Component(32비트)를 설치해야 합니다.\n\n지금 다운로드 페이지로 이동하시겠습니까?',
                buttons: ['다운로드 페이지 열기', '나중에'],
                defaultId: 0,
                cancelId: 1
            });
            
            if (response === 0) {
                // Brother 다운로드 페이지 열기
                shell.openExternal('https://support.brother.com/g/s/es/dev/en/bpac/download/index.html');
                
                // 추가 안내 다이얼로그
                dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: '설치 안내',
                    message: 'b-PAC Client Component 설치 안내',
                    detail: '1. 열린 페이지에서 "b-PAC Client Component" 선택\n2. "32-bit ver." 다운로드\n3. 다운로드한 파일 실행하여 설치\n4. 설치 완료 후 DrugLabel 재시작\n\n자세한 내용은 프로그램 폴더의 INSTALLATION.md 파일을 참조하세요.',
                    buttons: ['확인']
                });
            }
            
            // 메인 창에 상태 전송
            mainWindow.webContents.send('bpac-status', { installed: false });
        }
    });
    
    ps.on('error', (error) => {
        console.error('Failed to check b-PAC:', error);
        // 에러가 발생해도 앱은 계속 실행되도록
        mainWindow.webContents.send('bpac-status', { installed: false });
    });
}
