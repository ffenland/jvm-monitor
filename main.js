const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { parseFile } = require('./parser');
const { fetchAndSaveMedicine } = require('./medicine-fetcher');
const DatabaseManager = require('./database');
const { spawn } = require('child_process');
const { registerAllHandlers } = require('./src/main/ipc-handlers');
const { checkLicenseOnStartup } = require('./src/services/authService');
const { registerAuthHandlers } = require('./src/ipc/authHandlers');
const { registerUpdateHandlers } = require('./src/ipc/updateHandlers');
const { checkVersion } = require('./src/services/versionService');
let monitorPath = 'C:\\atc'; // Default directory to monitor (can be changed in config)

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
let authWindow; // 인증 창
let updateWindow; // 업데이트 창
let currentAvailableDates = new Set(); // To keep track of dates for dynamic updates
let currentConfig = {}; // Store current configuration
let watcher = null; // File watcher instance
let dbManager; // Database manager instance

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 800,
        title: 'Labelix - 약국 전문 라벨 출력 솔루션',
        icon: path.join(__dirname, 'build', 'icon.ico'), // ICO 아이콘 사용
        autoHideMenuBar: true, // 메뉴바 숨기기
        show: false, // 인증 완료 전까지 숨김
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

/**
 * 인증 창 생성
 */
function createAuthWindow() {
    authWindow = new BrowserWindow({
        width: 600,
        height: 750,
        title: '프로그램 인증',
        icon: path.join(__dirname, 'build', 'icon.ico'),
        autoHideMenuBar: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    authWindow.setMenuBarVisibility(false);
    authWindow.setMenu(null);

    authWindow.loadFile(path.join(__dirname, 'src', 'auth.html'));

    // 인증 창이 닫히면 앱 종료
    authWindow.on('closed', () => {
        authWindow = null;
        // 인증 없이 창을 닫으면 앱 종료
        if (!mainWindow || !mainWindow.isVisible()) {
            app.quit();
        }
    });

    // Open DevTools for debugging
    // authWindow.webContents.openDevTools();
}

/**
 * 업데이트 필요 창 생성
 */
function createUpdateWindow(versionInfo) {
    updateWindow = new BrowserWindow({
        width: 600,
        height: 800,
        title: '업데이트 필요',
        icon: path.join(__dirname, 'build', 'icon.ico'),
        autoHideMenuBar: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    updateWindow.setMenuBarVisibility(false);
    updateWindow.setMenu(null);

    updateWindow.loadFile(path.join(__dirname, 'src', 'update.html'));

    // 업데이트 창 닫기 방지
    updateWindow.on('close', (e) => {
        e.preventDefault();
        dialog.showMessageBox(updateWindow, {
            type: 'warning',
            title: '업데이트 필요',
            message: '프로그램을 사용하려면 업데이트가 필요합니다.',
            buttons: ['확인']
        });
    });

    // 버전 정보 저장 (IPC로 전달하기 위함)
    global.versionInfo = versionInfo;

    console.log('[Main] Update window created');
}

// 설정 파일 읽기/쓰기 함수
function loadConfig() {
    const appDataDir = DatabaseManager.getAppDataDir();
    if (!fs.existsSync(appDataDir)) {
        fs.mkdirSync(appDataDir, { recursive: true });
    }
    const configPath = DatabaseManager.getConfigPath();
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
            templatePath: defaultTemplatePath,
            atcPath: "C:\\atc",
            isFirstRun: true
        };
    }
    return currentConfig;
}

function saveConfig(config) {
    const appDataDir = DatabaseManager.getAppDataDir();
    const configPath = DatabaseManager.getConfigPath();

    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        currentConfig = config;
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
}

// 파일 감시 재시작 함수 (IPC 핸들러에서 사용)
function restartFileWatcher(newPath) {
    monitorPath = newPath;
    if (watcher) {
        watcher.close();
    }
    startFileWatcher();
}


app.whenReady().then(async () => {
    // 데이터베이스 초기화
    dbManager = new DatabaseManager();

    // 핸들러 등록 (가장 먼저)
    registerAuthHandlers(dbManager);
    registerUpdateHandlers();

    // 인증 성공 이벤트 리스너
    ipcMain.on('auth:success', () => {
        // 인증 창 닫기
        if (authWindow && !authWindow.isDestroyed()) {
            authWindow.removeAllListeners('close');
            authWindow.destroy();
            authWindow = null;
        }

        // 메인 창 표시
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // ========== 버전 체크 (최우선!) ==========
    console.log('[Main] Checking app version...');
    const versionCheck = await checkVersion();

    if (versionCheck.needsUpdate) {
        // 업데이트 필요 - 업데이트 창만 표시하고 앱 차단
        console.log('[Main] Update required! Showing update window...');
        createUpdateWindow(versionCheck.versionInfo);
        return; // 다른 창은 생성하지 않음
    }
    console.log('[Main] Version check passed');

    // ========== 라이선스 체크 ==========
    const licenseCheck = await checkLicenseOnStartup(dbManager);

    if (licenseCheck.needsAuth) {
        // 인증 필요 - 인증 창만 표시
        createAuthWindow();
        createWindow(); // 메인 창은 숨겨진 상태로 생성
    } else {
        // 인증 불필요 - 메인 창 바로 표시
        createWindow();
        mainWindow.show();
    }

    // IPC 핸들러 등록
    registerAllHandlers({
        dbManager,
        getMainWindow: () => mainWindow,
        loadConfig,
        saveConfig,
        getPowerShellPath,
        restartFileWatcher
    });

    // 설정 파일 로드
    const config = loadConfig();

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

    watcher.on('add', async (filePath) => {
        mainWindow.webContents.send('log-message', `File added: ${path.basename(filePath)}`);

        const fileName = path.basename(filePath);

        try {
            const match = fileName.match(/Copy\d+-(\d{8})(\d{6})\.txt/);
            const fileDate = match ? match[1] : null;
            const todayDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

            // 새로운 파서 사용
            const parseResult = await parseFile(filePath);

            if (!parseResult.success) {
                throw new Error(parseResult.error || 'Parsing failed');
            }

            const { patient, prescription, medicines } = parseResult;

            mainWindow.webContents.send('log-message', `Content of ${fileName} parsed successfully.`);

            // 1. 환자 정보 저장
            dbManager.saveOrUpdatePatient(patient);

            // 2. 약품 정보 수집 및 저장 (API 호출 포함)
            mainWindow.webContents.send('log-message', `Fetching ${medicines.length} medicine(s) information...`);

            const medicineResults = [];
            for (const med of medicines) {
                const result = await fetchAndSaveMedicine(med.code, med.name, dbManager);
                medicineResults.push({
                    ...med,
                    medicineInfo: result.medicine,
                    apiFailure: result.apiFailure || false
                });

                if (result.apiFailure) {
                    mainWindow.webContents.send('log-message', `Failed to fetch medicine: ${med.name} (${med.code})`);
                }
            }

            // 3. 처방전 정보 저장 (약품 관계 포함)
            const prescriptionData = {
                patientId: patient.patientId,
                receiptDateRaw: prescription.receiptDateRaw,
                receiptDate: prescription.receiptDate,
                receiptNum: prescription.receiptNum,
                hospitalName: prescription.hospitalName,
                doctorName: prescription.doctorName,
                medicines: medicines.map(med => ({
                    code: med.code,
                    name: med.name,  // 약품명 추가
                    prescriptionDays: med.prescriptionDays,
                    dailyDose: med.dailyDose,
                    singleDose: med.singleDose
                }))
            };

            const saveResult = dbManager.savePrescription(prescriptionData);

            if (saveResult.success) {
                mainWindow.webContents.send('log-message', `Prescription saved to database (ID: ${saveResult.id})`);

                // 4. 화면 갱신 (오늘 날짜 데이터 재조회)
                const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const todayPrescriptions = dbManager.getPrescriptionsByParsingDate(today);

                const refreshedData = todayPrescriptions.map((prescription, index) => ({
                    ...prescription,
                    medicines: prescription.medicines.map(med => ({
                        code: med.medicineCode,
                        name: med.drug_name,
                        prescriptionDays: med.prescriptionDays,
                        dailyDose: med.dailyDose,
                        singleDose: med.singleDose,
                        medicineInfo: dbManager.getMedicineByBohcode(med.medicineCode)
                    })),
                    timestamp: prescription.parsedAt ? new Date(prescription.parsedAt).getTime() : Date.now() - (1000 * index)
                }));

                mainWindow.webContents.send('data-for-date', refreshedData);

                // 5. 날짜 목록 업데이트
                const isNewDate = !currentAvailableDates.has(todayDate);
                if (isNewDate) {
                    currentAvailableDates.add(todayDate);
                    const dbDatesQuery = dbManager.db.prepare('SELECT DISTINCT parsedDate FROM parsing_history ORDER BY parsedDate DESC').all();
                    let allDates = dbDatesQuery.map(row => row.parsedDate);

                    if (!allDates.includes(today)) {
                        allDates.unshift(today);
                    } else {
                        allDates = allDates.filter(date => date !== today);
                        allDates.unshift(today);
                    }
                    mainWindow.webContents.send('update-date-list', allDates);
                }

                // 6. 자동 출력 처리 (autoPrint 필드가 있는 약품만)
                // TODO: autoPrint 기능은 나중에 추가

            } else {
                mainWindow.webContents.send('log-message', `Failed to save prescription: ${saveResult.message || 'Unknown error'}`);
            }

        } catch (parseError) {
            const errorMessage = `Error parsing ${fileName}: ${parseError.message}`;
            console.error(errorMessage);
            mainWindow.webContents.send('log-message', errorMessage);
        }
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

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// saveDataToFile 함수는 더 이상 필요 없음 - 파서에서 직접 DB에 저장

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
                message: 'Labelix를 사용하려면 Brother b-PAC Client Component가 필요합니다.',
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
                    detail: '1. 열린 페이지에서 "b-PAC Client Component" 선택\n2. "32-bit ver." 다운로드\n3. 다운로드한 파일 실행하여 설치\n4. 설치 완료 후 Labelix 재시작\n\n자세한 내용은 프로그램 폴더의 INSTALLATION.md 파일을 참조하세요.',
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
