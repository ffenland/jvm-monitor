const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { parseFile } = require('./src/services/parser');
const { fetchAndSaveMedicine } = require('./src/services/medicine-fetcher');
const DatabaseManager = require('./src/services/database');
const logger = require('./src/services/logger');
const { spawn } = require('child_process');
const { registerAllHandlers } = require('./src/main/ipc-handlers');
const { checkLicenseOnStartup } = require('./src/services/authService');
const { registerAuthHandlers } = require('./src/ipc/authHandlers');
const { registerUpdateHandlers } = require('./src/ipc/updateHandlers');
const { registerTemplateHandlers } = require('./src/main/ipc-handlers/templateHandlers');
const { checkVersion } = require('./src/services/versionService');
const { getKSTDateString } = require('./src/utils/dateUtils');
let monitorPath = null; // Will be set from DB config (no hardcoded default value)

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

// ========== Single Instance Lock ==========
// 앱이 이미 실행 중이면 새 인스턴스를 종료하고 기존 창을 포커싱
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // 이미 다른 인스턴스가 실행 중이면 종료
    console.log('[Main] Another instance is already running. Quitting...');
    app.quit();
} else {
    // 두 번째 인스턴스가 실행되려고 할 때
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('[Main] Second instance detected. Focusing existing window...');

        // 기존 창이 있으면 포커싱
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
            mainWindow.show();
        } else if (authWindow) {
            // 인증 창이 열려있으면 인증 창 포커싱
            if (authWindow.isMinimized()) {
                authWindow.restore();
            }
            authWindow.focus();
            authWindow.show();
        } else if (updateWindow) {
            // 업데이트 창이 열려있으면 업데이트 창 포커싱
            if (updateWindow.isMinimized()) {
                updateWindow.restore();
            }
            updateWindow.focus();
            updateWindow.show();
        }
    });
}

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
            nodeIntegration: false, // Recommended for security
            devTools: false
        }
    });

    // 메뉴를 완전히 제거 (Alt 키로도 접근 불가)
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setMenu(null);

    // 개발자 도구 단축키 차단
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            event.preventDefault();
        }
        if (input.key === 'F12') {
            event.preventDefault();
        }
    });

    mainWindow.loadFile('index.html');
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
            nodeIntegration: false,
            devTools: false // 개발자 도구 완전 비활성화
        }
    });

    authWindow.setMenuBarVisibility(false);
    authWindow.setMenu(null);

    // 개발자 도구 단축키 차단
    authWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            event.preventDefault();
        }
        if (input.key === 'F12') {
            event.preventDefault();
        }
    });

    authWindow.loadFile(path.join(__dirname, 'src', 'views', 'auth.html'));

    // 인증 창이 닫히면 앱 종료 (인증 성공한 경우는 제외)
    let authSucceeded = false;
    authWindow.on('closed', () => {
        authWindow = null;
        // 인증 성공하지 않고 창을 닫으면 앱 종료
        if (!authSucceeded && (!mainWindow || !mainWindow.isVisible())) {
            app.quit();
        }
    });

    // 인증 성공 플래그 설정을 위한 이벤트 리스너
    ipcMain.once('auth:success-flag', () => {
        authSucceeded = true;
    });
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
            nodeIntegration: false,
            devTools: false // 개발자 도구 완전 비활성화
        }
    });

    updateWindow.setMenuBarVisibility(false);
    updateWindow.setMenu(null);

    // 개발자 도구 단축키 차단
    updateWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
            event.preventDefault();
        }
        if (input.key === 'F12') {
            event.preventDefault();
        }
    });

    updateWindow.loadFile(path.join(__dirname, 'src', 'views', 'update.html'));

    // 업데이트 창 닫기 시 경고 및 종료 확인
    updateWindow.on('close', (e) => {
        e.preventDefault();

        dialog.showMessageBox(updateWindow, {
            type: 'warning',
            title: '업데이트 필요',
            message: '업데이트하지 않으면 프로그램을 사용할 수 없습니다.\n정말 종료하시겠습니까?',
            buttons: ['종료', '취소'],
            defaultId: 1,  // 기본 선택: 취소
            cancelId: 1     // ESC/X 클릭 시: 취소
        }).then(result => {
            if (result.response === 0) {
                // "종료" 버튼 선택 시
                updateWindow.removeAllListeners('close');
                app.quit();
            }
            // "취소" 버튼 선택 시 - 아무것도 안 함 (창이 그대로 유지됨)
        });
    });

    // 버전 정보 저장 (IPC로 전달하기 위함)
    global.versionInfo = versionInfo;

    console.log('[Main] Update window created');
}

// 설정 파일 읽기/쓰기 함수 (DB 기반)
function loadConfig() {
    try {
        // DB에서 앱 설정 조회
        const dbSettings = dbManager.getAppSettings();

        // DB에서 라이선스 정보 조회
        const licenseInfo = dbManager.getLicense();

        // monitorPath 업데이트
        if (dbSettings.atcPath) {
            monitorPath = dbSettings.atcPath;
        }

        // 기본 템플릿 경로 설정 (프로그램 설치 경로)
        // 배포 환경: resources/templates/default.lbx
        // 개발 환경: __dirname/templates/default.lbx
        const defaultTemplatePath = app.isPackaged
            ? path.join(process.resourcesPath, 'templates', 'default.lbx')
            : path.join(__dirname, 'templates', 'default.lbx');

        // 기본 템플릿 존재 여부 확인 (필수!)
        if (!fs.existsSync(defaultTemplatePath)) {
            dialog.showErrorBox(
                '기본 템플릿 파일 누락',
                '프로그램 설치 경로에 기본 템플릿 파일이 없습니다.\n프로그램을 재설치해주세요.\n\n프로그램을 종료합니다.'
            );
            app.quit();
            return null;
        }

        // DB에 저장된 템플릿 경로 확인
        if (dbSettings.templatePath) {
            // 저장된 템플릿 경로가 유효한지 확인
            if (!fs.existsSync(dbSettings.templatePath)) {
                console.log('[Config] Saved template not found, reverting to default template');
                logger.warning('저장된 템플릿을 찾을 수 없어 기본 템플릿으로 전환합니다', {
                    category: 'system',
                    details: { savedPath: dbSettings.templatePath, defaultPath: defaultTemplatePath }
                });
                dbSettings.templatePath = defaultTemplatePath;
                dbManager.saveAppSettings(dbSettings);
            }
        } else {
            // 처음 실행 시 기본 템플릿으로 설정
            console.log('[Config] Setting default template for first time');
            dbSettings.templatePath = defaultTemplatePath;
            dbManager.saveAppSettings(dbSettings);
        }

        // Documents/Labelix/templates 폴더는 커스텀 템플릿 전용으로 생성만 해둠
        const customTemplatesDir = DatabaseManager.getTemplatesDir();
        if (!fs.existsSync(customTemplatesDir)) {
            fs.mkdirSync(customTemplatesDir, { recursive: true });
            console.log('[Config] Created custom templates directory:', customTemplatesDir);
        }

        currentConfig = {
            atcPath: dbSettings.atcPath,
            templatePath: dbSettings.templatePath,
            deleteOriginalFile: dbSettings.deleteOriginalFile === 1,
            pharmacyName: licenseInfo?.pharmacyName || ''
        };

        return currentConfig;
    } catch (error) {
        logger.error('설정 로드 실패', {
            category: 'system',
            error: error
        });

        // DB 조회 실패 시 기본 템플릿 경로 사용
        const defaultTemplatePath = app.isPackaged
            ? path.join(process.resourcesPath, 'templates', 'default.lbx')
            : path.join(__dirname, 'templates', 'default.lbx');

        currentConfig = {
            atcPath: '', // 빈 문자열 (기본값 없음)
            templatePath: defaultTemplatePath,
            deleteOriginalFile: false,
            pharmacyName: ''
        };

        return currentConfig;
    }
}

function saveConfig(config) {
    try {
        // DB에 앱 설정 저장
        const success = dbManager.saveAppSettings({
            atcPath: config.atcPath,
            templatePath: config.templatePath,
            deleteOriginalFile: config.deleteOriginalFile
        });

        if (success) {
            currentConfig = config;

            // atcPath가 변경되었으면 monitorPath 업데이트
            if (config.atcPath) {
                monitorPath = config.atcPath;
            }

            return true;
        }
        return false;
    } catch (error) {
        logger.error('설정 저장 실패', {
            category: 'system',
            error: error,
            details: {
                atcPath: config.atcPath,
                templatePath: config.templatePath
            }
        });
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


/**
 * 기존 템플릿 파일을 DB로 마이그레이션
 */
async function migrateTemplatesToDB() {
    try {
        console.log('[Main] Checking template migration...');

        // 올바른 templates 디렉토리 경로
        const templatesDir = app.isPackaged
            ? path.join(process.resourcesPath, 'templates')
            : path.join(__dirname, 'templates');

        // templates 폴더의 모든 .lbx 파일 가져오기
        const availableTemplateFiles = fs.existsSync(templatesDir)
            ? fs.readdirSync(templatesDir).filter(f => f.endsWith('.lbx'))
            : [];

        // 이미 템플릿이 DB에 있는지 확인
        const existingTemplates = dbManager.getAllTemplates();

        // 기존 템플릿이 있으면 시스템 템플릿 경로 검증 및 추가
        if (existingTemplates.length > 0) {
            console.log('[Main] Templates already exist, validating and syncing system templates...');

            let pathsUpdated = false;
            let templatesAdded = false;

            // 1. 기존 템플릿의 경로 검증 및 수정
            for (const template of existingTemplates) {
                const fileName = path.basename(template.filePath);

                // templates 폴더에 있는 파일인지 확인 (시스템 템플릿)
                if (availableTemplateFiles.includes(fileName)) {
                    const correctPath = path.join(templatesDir, fileName);

                    // 경로가 다르거나 파일이 존재하지 않으면 수정
                    if (template.filePath !== correctPath) {
                        console.log(`[Main] Updating system template path: ${fileName}`);
                        console.log(`  - Old: ${template.filePath}`);
                        console.log(`  - New: ${correctPath}`);

                        // DB 경로 업데이트
                        const updateResult = dbManager.updateTemplate(template.id, {
                            filePath: correctPath
                        });

                        if (updateResult.success) {
                            console.log(`[Main] Updated template path: ${fileName}`);
                            pathsUpdated = true;
                        } else {
                            console.error(`[Main] Failed to update template path: ${fileName}`, updateResult.message);
                        }
                    }
                }
            }

            // 2. DB에 없는 새 시스템 템플릿 추가
            const existingFileNames = existingTemplates.map(t => path.basename(t.filePath));
            const newTemplateFiles = availableTemplateFiles.filter(f => !existingFileNames.includes(f));

            if (newTemplateFiles.length > 0) {
                console.log(`[Main] Found ${newTemplateFiles.length} new system template(s):`, newTemplateFiles);

                for (const fileName of newTemplateFiles) {
                    const filePath = path.join(templatesDir, fileName);
                    const name = path.basename(fileName, '.lbx');

                    const result = dbManager.addTemplate(name, filePath, '시스템 기본 템플릿');

                    if (result.success) {
                        console.log(`[Main] Added new system template: ${name} (ID: ${result.id})`);
                        templatesAdded = true;
                    } else {
                        console.error(`[Main] Failed to add template ${name}:`, result.message);
                    }
                }
            }

            if (pathsUpdated || templatesAdded) {
                logger.info('System templates synchronized', {
                    category: 'system',
                    details: { pathsUpdated, templatesAdded, newCount: newTemplateFiles.length }
                });
            }

            console.log('[Main] Template synchronization completed');
            return;
        }

        // 템플릿이 없으면 새로 추가
        if (!fs.existsSync(templatesDir)) {
            console.log('[Main] Templates directory not found, skipping migration');
            return;
        }

        const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.lbx'));
        console.log('[Main] Found template files:', files);

        // 각 템플릿 파일을 DB에 추가
        for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const filePath = path.join(templatesDir, fileName);
            const name = path.basename(fileName, '.lbx');

            const result = dbManager.addTemplate(name, filePath, '시스템 기본 템플릿');

            if (result.success) {
                console.log(`[Main] Migrated template: ${name} (ID: ${result.id})`);

                // 첫 번째 템플릿을 기본 템플릿으로 설정
                if (i === 0) {
                    dbManager.setDefaultTemplate(result.id);
                    console.log(`[Main] Set default template: ${name}`);
                }
            } else {
                console.error(`[Main] Failed to migrate template ${name}:`, result.message);
            }
        }

        logger.info('Template migration completed', {
            category: 'system',
            details: { templateCount: files.length }
        });
    } catch (error) {
        console.error('[Main] Template migration failed:', error);
        logger.error('Template migration failed', {
            category: 'system',
            error: error
        });
    }
}

app.whenReady().then(async () => {
    // ========== 1. 데이터베이스 초기화 (최우선!) ==========
    console.log('[Main] Initializing database...');
    dbManager = new DatabaseManager();

    // ========== 1-1. 로거 초기화 및 30일 이상 된 로그 정리 ==========
    logger.setDatabaseManager(dbManager);
    logger.cleanupOldLogs();
    logger.info('Application started', { category: 'system' });

    // ========== 1-2. 템플릿 마이그레이션 ==========
    await migrateTemplatesToDB();

    // ========== 2. DB에서 설정 로드 (monitorPath 업데이트) ==========
    console.log('[Main] Loading config from database...');
    const config = loadConfig();
    console.log('[Main] Monitor path set to:', monitorPath);

    // ========== 3. IPC 핸들러 등록 ==========
    registerAuthHandlers(dbManager);
    registerUpdateHandlers();
    registerTemplateHandlers(dbManager);

    // 인증 성공 이벤트 리스너
    ipcMain.on('auth:success', () => {
        console.log('[Main] Authentication succeeded, showing main window...');

        // 메인 창 먼저 표시
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }

        // 인증 성공 플래그 설정
        ipcMain.emit('auth:success-flag');

        // 인증 창 닫기
        if (authWindow && !authWindow.isDestroyed()) {
            authWindow.removeAllListeners('closed');
            authWindow.destroy();
            authWindow = null;
        }

        // 파일 감시 시작 (인증 완료 후)
        console.log('[Main] Starting file watcher after authentication...');
        startFileWatcher();

        console.log('[Main] Main window shown, auth window closed');
    });

    // ========== 4. 버전 체크 ==========
    console.log('[Main] Checking app version...');
    const versionCheck = await checkVersion();

    if (versionCheck.needsUpdate) {
        // 업데이트 필요 - 업데이트 창만 표시하고 앱 차단
        console.log('[Main] Update required! Showing update window...');
        createUpdateWindow(versionCheck.versionInfo);
        return; // 다른 창은 생성하지 않음
    }
    console.log('[Main] Version check passed');

    // ========== 5. 라이선스 체크 ==========
    console.log('[Main] Checking license...');
    const licenseCheck = await checkLicenseOnStartup(dbManager);

    // ========== 6. 창 생성 ==========
    if (licenseCheck.needsAuth) {
        // 인증 필요 - 인증 창만 표시
        console.log('[Main] Auth required, creating auth window...');
        createAuthWindow();
        createWindow(); // 메인 창은 숨겨진 상태로 생성
    } else {
        // 인증 불필요 - 메인 창 바로 표시
        console.log('[Main] No auth required, creating main window...');
        createWindow();
        mainWindow.show();
    }

    // ========== 7. IPC 핸들러 등록 (메인 창 생성 후) ==========
    registerAllHandlers({
        dbManager,
        getMainWindow: () => mainWindow,
        loadConfig,
        saveConfig,
        getPowerShellPath,
        restartFileWatcher
    });

    // ========== 8. 파일 감시 시작 (설정이 이미 로드됨) ==========
    if (!licenseCheck.needsAuth) {
        // 인증이 필요 없는 경우에만 여기서 시작
        console.log('[Main] Starting file watcher (no auth needed)...');
        console.log('[Main] Monitoring path:', monitorPath);
        startFileWatcher();
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
});

// 파일 감시 시작 함수
function startFileWatcher() {
    if (!mainWindow) return;

    // monitorPath가 비어있으면 경고 메시지 전송하고 종료
    if (!monitorPath || monitorPath.trim() === '') {
        console.warn('[File Watcher] OCS 파일 경로가 설정되지 않았습니다.');
        mainWindow.webContents.send('log-message', '⚠️ OCS 파일 경로를 설정하세요');
        mainWindow.webContents.send('ocs-path-warning', 'OCS 파일 경로를 설정하세요');
        return;
    }

    // 기존 watcher가 있으면 종료
    if (watcher) {
        watcher.close();
    }

    console.log('[File Watcher] Starting file watcher for:', monitorPath);

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
            const todayDate = getKSTDateString(); // KST 기준 오늘 날짜

            // 파일 내용을 즉시 메모리 버퍼로 읽기 (재시도 로직 포함)
            // OCS 프로그램이 파일을 삭제하기 전에 안전하게 복사
            let fileBuffer;
            let readSuccess = false;

            for (let retry = 0; retry < 3; retry++) {
                try {
                    fileBuffer = fs.readFileSync(filePath);
                    readSuccess = true;
                    mainWindow.webContents.send('log-message', `File read to buffer: ${fileName}`);
                    break; // 성공하면 루프 탈출
                } catch (readError) {
                    const isLastRetry = retry === 2;

                    if (readError.code === 'ENOENT') {
                        // 파일이 없음 (OCS가 이미 삭제)
                        mainWindow.webContents.send('log-message', `⚠️ File disappeared: ${fileName} (retry ${retry + 1}/3)`);
                        if (isLastRetry) {
                            throw new Error(`File disappeared before reading: ${fileName}`);
                        }
                    } else if (readError.code === 'EBUSY' || readError.code === 'EPERM') {
                        // 파일이 잠겨있거나 권한 문제
                        mainWindow.webContents.send('log-message', `⚠️ File locked: ${fileName} (retry ${retry + 1}/3)`);
                        if (isLastRetry) {
                            throw new Error(`File locked or permission denied: ${fileName}`);
                        }
                    } else {
                        // 기타 오류
                        if (isLastRetry) {
                            throw readError;
                        }
                    }

                    // 재시도 전 50ms 대기
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            if (!readSuccess) {
                throw new Error(`Failed to read file after 3 retries: ${fileName}`);
            }

            // 버퍼를 파서에 전달 (원본 파일이 삭제되어도 무관)
            const parseResult = await parseFile(fileBuffer, fileName);

            if (!parseResult.success) {
                // 검증 실패인 경우 HTML 모달 표시
                if (parseResult.validationFailed) {
                    console.error('[Validation Failed]', parseResult.validationErrors);
                    mainWindow.webContents.send('log-message', `⚠️ 파일 검증 실패: ${fileName}`);

                    // 검증 오류 상세 로그
                    parseResult.validationErrors.forEach(error => {
                        console.error(`  - ${error}`);
                        mainWindow.webContents.send('log-message', `  ⚠️ ${error}`);
                    });

                    // HTML 모달 표시
                    mainWindow.webContents.send('show-validation-warning', {
                        errors: parseResult.validationErrors,
                        fileName: fileName
                    });

                    return; // DB 저장하지 않고 종료
                }

                // 일반 파싱 오류
                throw new Error(parseResult.error || 'Parsing failed');
            }

            const { patient, prescription, medicines } = parseResult;

            mainWindow.webContents.send('log-message', `Content of ${fileName} parsed successfully.`);

            // 1. 환자 정보 저장
            dbManager.saveOrUpdatePatient(patient);

            // 2. 약품 정보 수집 및 저장 (API 호출 포함)
            mainWindow.webContents.send('log-message', `Fetching ${medicines.length} medicine(s) information...`);

            const medicineResults = [];
            let hasApiFailure = false; // API 실패 플래그

            for (const med of medicines) {
                const result = await fetchAndSaveMedicine(med.code, med.name, dbManager);
                medicineResults.push({
                    ...med,
                    medicineInfo: result.medicine,
                    apiFailure: result.apiFailure || false
                });

                if (result.apiFailure) {
                    hasApiFailure = true;
                    mainWindow.webContents.send('log-message', `Failed to fetch medicine: ${med.name} (${med.code})`);
                }
            }

            // API 실패가 하나라도 있으면 뱃지 업데이트 이벤트 발생
            if (hasApiFailure) {
                mainWindow.webContents.send('medicine-data-updated');
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
                const today = getKSTDateString(); // KST 기준 오늘 날짜
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

                // 6. 자동 출력 처리 (autoPrint가 true인 약품만)
                const prescriptionWithMeds = dbManager.getPrescriptionById(saveResult.id);

                if (prescriptionWithMeds) {
                    const prescriptionMedicines = dbManager.getPrescriptionMedicines(saveResult.id);
                    const patientInfo = dbManager.getPatient(prescriptionWithMeds.patientId);
                    const autoPrintMedicines = prescriptionMedicines.filter(med => med.autoPrint === 1);

                    if (autoPrintMedicines.length > 0) {
                        mainWindow.webContents.send('log-message', `자동 출력 시작: ${autoPrintMedicines.length}개 약품`);

                        // 자동 출력 요청 전송 (환자명 추가)
                        mainWindow.webContents.send('auto-print-medicines', {
                            prescription: {
                                ...prescriptionWithMeds,
                                patientName: patientInfo ? patientInfo.name : '환자명 없음'
                            },
                            medicines: autoPrintMedicines
                        });
                    }
                }

                // 7. 설정에 따라 원본 파일 삭제
                const currentConfig = loadConfig();
                if (currentConfig.deleteOriginalFile === true) {
                    try {
                        fs.unlinkSync(filePath);
                        mainWindow.webContents.send('log-message', `원본 파일 삭제 완료: ${fileName}`);
                    } catch (deleteError) {
                        logger.error('원본 파일 삭제 실패', {
                            category: 'system',
                            error: deleteError,
                            details: { fileName, filePath }
                        });
                        mainWindow.webContents.send('log-message', `⚠️ 원본 파일 삭제 실패: ${fileName} (${deleteError.message})`);
                    }
                }

            } else {
                mainWindow.webContents.send('log-message', `Failed to save prescription: ${saveResult.message || 'Unknown error'}`);
            }

        } catch (parseError) {
            logger.error('파일 파싱 실패', {
                category: 'parsing',
                error: parseError,
                details: { fileName, filePath }
            });
            const errorMessage = `Error parsing ${fileName}: ${parseError.message}`;
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
        logger.error('b-PAC 체크 실패', {
            category: 'system',
            error: error
        });
        // 에러가 발생해도 앱은 계속 실행되도록
        mainWindow.webContents.send('bpac-status', { installed: false });
    });
}

// ========== 로그 관련 IPC 핸들러 ==========

/**
 * 로그 조회
 */
ipcMain.handle('get-app-logs', async () => {
    try {
        const logs = dbManager.getAllLogs(100);
        return logs;
    } catch (error) {
        logger.error('Failed to get app logs', {
            category: 'system',
            error: error
        });
        return [];
    }
});

/**
 * 로그 내보내기 (텍스트 파일로 저장)
 */
ipcMain.handle('export-app-logs', async () => {
    try {
        const logs = dbManager.getAllLogs(1000); // 최대 1000개 로그 내보내기

        // 로그를 텍스트로 변환
        const logText = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleString('ko-KR');
            const details = log.details ? `\n상세: ${JSON.stringify(log.details, null, 2)}` : '';
            const stack = log.stack ? `\n스택: ${log.stack}` : '';
            return `[${timestamp}] [${log.level.toUpperCase()}] ${log.category ? `[${log.category}] ` : ''}${log.message}${details}${stack}`;
        }).join('\n\n' + '='.repeat(80) + '\n\n');

        // 파일 저장 경로 (앱 데이터 디렉토리)
        const appDataDir = DatabaseManager.getAppDataDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filePath = path.join(appDataDir, `app-logs-${timestamp}.txt`);

        fs.writeFileSync(filePath, logText, 'utf8');

        logger.info('Logs exported', {
            category: 'system',
            details: { filePath, logCount: logs.length }
        });

        return { success: true, filePath };
    } catch (error) {
        logger.error('Failed to export logs', {
            category: 'system',
            error: error
        });
        return { success: false, error: error.message };
    }
});

/**
 * 로그 전체 삭제
 */
ipcMain.handle('delete-all-app-logs', async () => {
    try {
        const result = dbManager.deleteAllLogs();

        logger.info('All logs deleted', {
            category: 'system',
            details: { deletedCount: result.changes }
        });

        return { success: true, deletedCount: result.changes };
    } catch (error) {
        logger.error('Failed to delete all logs', {
            category: 'system',
            error: error
        });
        return { success: false, error: error.message };
    }
});

/**
 * 앱 버전 정보 가져오기
 */
ipcMain.handle('get-app-version', async () => {
    const packageJson = require('./package.json');
    return packageJson.version;
});

/**
 * 최신 버전 정보 가져오기 (Firestore에서 조회)
 */
ipcMain.handle('get-latest-version', async () => {
    try {
        // global.versionInfo가 있으면 사용 (프로그램 시작 시 Firestore에서 가져온 정보)
        if (global.versionInfo && global.versionInfo.latestVersion) {
            console.log('[Main] Returning latest version from global:', global.versionInfo.latestVersion);
            return global.versionInfo.latestVersion;
        }

        // global에 없으면 versionService로 다시 조회
        const { getVersionConfig } = require('./src/services/versionService');
        const versionConfig = await getVersionConfig();

        if (versionConfig && versionConfig.latestVersion) {
            console.log('[Main] Returning latest version from Firestore:', versionConfig.latestVersion);
            return versionConfig.latestVersion;
        }

        // Firestore에 latestVersion이 없으면 minRequiredVersion 사용
        if (versionConfig && versionConfig.minRequiredVersion) {
            console.log('[Main] Using minRequiredVersion as latest:', versionConfig.minRequiredVersion);
            return versionConfig.minRequiredVersion;
        }

        console.log('[Main] No version info available');
        return null;
    } catch (error) {
        console.error('[Main] Failed to get latest version:', error);
        return null;
    }
});

/**
 * 다운로드 URL 가져오기 (Firestore에서 조회)
 */
ipcMain.handle('get-download-url', async () => {
    try {
        // global.versionInfo가 있으면 사용
        if (global.versionInfo && global.versionInfo.downloadUrl) {
            console.log('[Main] Returning download URL from global:', global.versionInfo.downloadUrl);
            return global.versionInfo.downloadUrl;
        }

        // global에 없으면 versionService로 다시 조회
        const { getVersionConfig } = require('./src/services/versionService');
        const versionConfig = await getVersionConfig();

        if (versionConfig && versionConfig.downloadUrl) {
            console.log('[Main] Returning download URL from Firestore:', versionConfig.downloadUrl);
            return versionConfig.downloadUrl;
        }

        console.log('[Main] No download URL available');
        return null;
    } catch (error) {
        console.error('[Main] Failed to get download URL:', error);
        return null;
    }
});

/**
 * 에러 로그를 Firebase로 전송
 */
ipcMain.handle('send-errors-to-firebase', async () => {
    try {
        const { sendErrorLogsOnly } = require('./src/services/errorReporter');

        // DB에서 에러 로그만 가져오기
        const allLogs = dbManager.getAllLogs(100); // 최근 100개
        const errorLogs = allLogs.filter(log => log.level === 'error');

        if (errorLogs.length === 0) {
            return {
                success: true,
                message: '전송할 에러 로그가 없습니다.',
                successCount: 0,
                failCount: 0,
                total: 0
            };
        }

        // 라이선스 정보 가져오기
        let licenseInfo = {};
        try {
            const license = dbManager.getLicense();
            if (license) {
                licenseInfo = {
                    pharmacyName: license.pharmacyName,
                    licenseKey: license.licenseKey
                };
            }
        } catch (err) {
            console.warn('Failed to get license info:', err);
        }

        // Firebase로 전송
        const result = await sendErrorLogsOnly(errorLogs, licenseInfo);

        logger.info('에러 로그 Firebase 전송 완료', {
            category: 'system',
            details: {
                successCount: result.successCount,
                failCount: result.failCount,
                total: result.total
            }
        });

        return {
            success: true,
            message: `${result.successCount}개의 에러 로그를 전송했습니다.`,
            successCount: result.successCount,
            failCount: result.failCount,
            total: result.total
        };

    } catch (error) {
        logger.error('Firebase 전송 실패', {
            category: 'system',
            error: error
        });
        return {
            success: false,
            error: error.message,
            message: 'Firebase 전송 중 오류가 발생했습니다.'
        };
    }
});
