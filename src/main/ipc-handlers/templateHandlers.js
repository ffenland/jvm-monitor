/**
 * 템플릿 관련 IPC 핸들러
 */

const { ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let dbManager = null;

/**
 * 템플릿 관련 IPC 핸들러 등록
 * @param {DatabaseManager} db - 데이터베이스 매니저 인스턴스
 */
function registerTemplateHandlers(db) {
    dbManager = db;

    /**
     * 모든 템플릿 조회
     */
    ipcMain.handle('get-all-templates', async () => {
        try {
            const templates = dbManager.getAllTemplates();
            return { success: true, templates };
        } catch (error) {
            console.error('[TemplateHandlers] Failed to get templates:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 템플릿 조회 (ID로)
     */
    ipcMain.handle('get-template', async (event, id) => {
        try {
            const template = dbManager.getTemplateById(id);
            if (!template) {
                return { success: false, message: '템플릿을 찾을 수 없습니다.' };
            }
            return { success: true, template };
        } catch (error) {
            console.error('[TemplateHandlers] Failed to get template:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 템플릿 추가
     */
    ipcMain.handle('add-template', async (event, data) => {
        try {
            const { name, filePath, description } = data;

            // 파일 존재 여부 확인
            if (!fs.existsSync(filePath)) {
                return { success: false, message: '템플릿 파일을 찾을 수 없습니다.' };
            }

            const result = dbManager.addTemplate(name, filePath, description);
            return result;
        } catch (error) {
            console.error('[TemplateHandlers] Failed to add template:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 템플릿 수정 (이름, 설명만)
     */
    ipcMain.handle('update-template', async (event, id, data) => {
        try {
            const result = dbManager.updateTemplate(id, data);
            return result;
        } catch (error) {
            console.error('[TemplateHandlers] Failed to update template:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 템플릿 삭제
     */
    ipcMain.handle('delete-template', async (event, id) => {
        try {
            // 사용 통계 조회
            const stats = dbManager.getTemplateUsageStats(id);

            if (stats.patientCount > 0 || stats.medicineCount > 0) {
                return {
                    success: false,
                    needsConfirmation: true,
                    message: `이 템플릿은 ${stats.patientCount}명의 환자와 ${stats.medicineCount}개의 약품에서 사용 중입니다.`,
                    stats
                };
            }

            const result = dbManager.deleteTemplate(id);
            return result;
        } catch (error) {
            console.error('[TemplateHandlers] Failed to delete template:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 기본 템플릿 설정
     */
    ipcMain.handle('set-default-template', async (event, id) => {
        try {
            const result = dbManager.setDefaultTemplate(id);
            return result;
        } catch (error) {
            console.error('[TemplateHandlers] Failed to set default template:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 환자별 템플릿 조회
     */
    ipcMain.handle('get-patient-template', async (event, patientId) => {
        try {
            const template = dbManager.getPatientTemplate(patientId);
            return { success: true, template };
        } catch (error) {
            console.error('[TemplateHandlers] Failed to get patient template:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 환자별 템플릿 설정
     */
    ipcMain.handle('set-patient-template', async (event, patientId, templateId) => {
        try {
            const result = dbManager.setPatientTemplate(patientId, templateId);
            return result;
        } catch (error) {
            console.error('[TemplateHandlers] Failed to set patient template:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 환자별 템플릿 설정 삭제
     */
    ipcMain.handle('delete-patient-template', async (event, patientId) => {
        try {
            const result = dbManager.deletePatientTemplate(patientId);
            return result;
        } catch (error) {
            console.error('[TemplateHandlers] Failed to delete patient template:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 약품별 템플릿 설정
     */
    ipcMain.handle('set-medicine-template', async (event, medicineCode, templateId) => {
        try {
            const result = dbManager.setMedicineTemplate(medicineCode, templateId);
            return result;
        } catch (error) {
            console.error('[TemplateHandlers] Failed to set medicine template:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 출력용 템플릿 조회 (우선순위: 환자 > 약품 > 기본)
     */
    ipcMain.handle('get-template-for-print', async (event, patientId, medicineCode) => {
        try {
            const template = dbManager.getTemplateForPrint(patientId, medicineCode);
            if (!template) {
                return { success: false, message: '사용 가능한 템플릿이 없습니다.' };
            }
            return { success: true, template };
        } catch (error) {
            console.error('[TemplateHandlers] Failed to get template for print:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 템플릿 관리 창 열기
     */
    ipcMain.handle('open-template-manager', async () => {
        try {
            const templateManagerWindow = new BrowserWindow({
                width: 1000,
                height: 700,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, '../../../preload.js')
                },
                autoHideMenuBar: true,
                resizable: true
            });

            templateManagerWindow.loadFile(path.join(__dirname, '../../views/template-manager.html'));

            // 개발 환경에서만 개발자 도구 열기
            if (process.env.NODE_ENV === 'development') {
                templateManagerWindow.webContents.openDevTools();
            }

            return { success: true };
        } catch (error) {
            console.error('[TemplateHandlers] Failed to open template manager:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 환자정보 창 열기
     */
    ipcMain.handle('open-patient-info', async (event, patientId) => {
        try {
            const patientInfoWindow = new BrowserWindow({
                width: 600,
                height: 500,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, '../../../preload.js')
                },
                autoHideMenuBar: true,
                resizable: false
            });

            patientInfoWindow.loadFile(
                path.join(__dirname, '../../views/patient-info.html'),
                { query: { patientId } }
            );

            // 개발 환경에서만 개발자 도구 열기
            if (process.env.NODE_ENV === 'development') {
                patientInfoWindow.webContents.openDevTools();
            }

            return { success: true };
        } catch (error) {
            console.error('[TemplateHandlers] Failed to open patient info:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 템플릿 파일 선택 대화상자
     */
    ipcMain.handle('select-template-file', async () => {
        try {
            const result = await dialog.showOpenDialog({
                title: '템플릿 파일 선택',
                filters: [
                    { name: 'Brother 라벨 템플릿', extensions: ['lbx'] }
                ],
                properties: ['openFile']
            });

            if (result.canceled) {
                return { success: false, canceled: true };
            }

            return { success: true, filePath: result.filePaths[0] };
        } catch (error) {
            console.error('[TemplateHandlers] Failed to select template file:', error);
            return { success: false, message: error.message };
        }
    });

    console.log('[TemplateHandlers] Template handlers registered');
}

module.exports = { registerTemplateHandlers };
