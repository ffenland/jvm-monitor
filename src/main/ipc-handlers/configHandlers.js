const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { app, shell } = require('electron');
const { spawn } = require('child_process');
const { previewTemplate } = require('../../services/print_brother');
const DatabaseManager = require('../../services/database');

/**
 * 설정 및 템플릿 관련 IPC 핸들러
 */
function registerConfigHandlers(getMainWindow, loadConfig, saveConfig, getPowerShellPath, restartFileWatcher) {
    // 외부 링크 열기
    ipcMain.handle('open-external', async (event, url) => {
        shell.openExternal(url);
        return { success: true };
    });

    // 설정 가져오기
    ipcMain.handle('get-config', async () => {
        return loadConfig();
    });

    // 첫 실행 확인
    ipcMain.handle('check-first-run', async () => {
        const config = loadConfig();
        // 약국명이 비어있으면 첫 실행으로 간주
        return !config.pharmacyName || config.pharmacyName === "";
    });

    // 설정 저장
    ipcMain.handle('save-config', async (event, config) => {
        try {
            // atcPath가 변경되었는지 확인
            const currentConfig = loadConfig();
            const oldPath = currentConfig.atcPath || 'C:\\atc';

            // isFirstRun 플래그 제거 (설정을 저장하면 더 이상 첫 실행이 아님)
            if (config.isFirstRun) {
                delete config.isFirstRun;
            }

            const success = saveConfig(config);

            if (success) {
                // atcPath가 변경되었으면 파일 감시 재시작
                if (config.atcPath && config.atcPath !== oldPath) {
                    console.log('ATC path updated to:', config.atcPath);
                    restartFileWatcher(config.atcPath);
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
            const templatesDir = DatabaseManager.getTemplatesDir();

            // 템플릿 폴더가 없으면 생성
            if (!fs.existsSync(templatesDir)) {
                fs.mkdirSync(templatesDir, { recursive: true });

                // 기본 템플릿을 앱 폴더에서 복사 (첫 실행 시)
                const sourceTemplatesDir = path.join(__dirname, '../../../templates');
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
            let fullPath = templatePath;

            // 상대 경로를 절대 경로로 변환 (템플릿은 이미 절대 경로로 저장됨)
            if (!path.isAbsolute(templatePath)) {
                const appDataDir = path.join(app.getPath('documents'), 'Labelix');
                const templatesDir = path.join(appDataDir, 'templates');
                fullPath = path.join(templatesDir, path.basename(templatePath));
            }

            // PowerShell 스크립트 경로
            const scriptPath = path.join(__dirname, '../../../scripts', 'check_template_fields.ps1');
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

    // 템플릿 미리보기
    ipcMain.handle('preview-template', async (event, templatePath) => {
        try {
            // 상대 경로를 절대 경로로 변환 (템플릿은 이미 절대 경로로 저장됨)
            let fullPath = templatePath;
            if (!path.isAbsolute(templatePath)) {
                const appDataDir = path.join(app.getPath('documents'), 'Labelix');
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

    // 폴더 선택 다이얼로그
    ipcMain.handle('select-folder', async (event, defaultPath) => {
        const mainWindow = getMainWindow();
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
}

module.exports = { registerConfigHandlers };
