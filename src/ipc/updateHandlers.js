/**
 * 업데이트 관련 IPC 핸들러
 */

const { ipcMain, shell, app } = require('electron');
const { checkVersion } = require('../services/versionService');

/**
 * 업데이트 관련 IPC 핸들러 등록
 */
function registerUpdateHandlers() {
    /**
     * 업데이트 정보 가져오기
     */
    ipcMain.handle('update:get-info', async () => {
        try {
            console.log('[UpdateHandlers] Getting update info...');

            // global에 저장된 정보 사용 (main.js에서 설정)
            if (global.versionInfo) {
                const info = {
                    currentVersion: app.getVersion(),
                    minRequiredVersion: global.versionInfo.minRequiredVersion,
                    latestVersion: global.versionInfo.latestVersion || global.versionInfo.minRequiredVersion,
                    downloadUrl: global.versionInfo.downloadUrl || 'https://github.com',
                    updateMessage: global.versionInfo.updateMessage || '프로그램을 계속 사용하려면 최신 버전으로 업데이트해주세요.',
                    features: global.versionInfo.features || []
                };
                console.log('[UpdateHandlers] Returning version info:', info);
                return info;
            }

            // global에 없으면 다시 체크
            const versionCheck = await checkVersion();

            if (versionCheck.needsUpdate && versionCheck.versionInfo) {
                const info = {
                    currentVersion: versionCheck.currentVersion,
                    minRequiredVersion: versionCheck.versionInfo.minRequiredVersion,
                    latestVersion: versionCheck.versionInfo.latestVersion || versionCheck.versionInfo.minRequiredVersion,
                    downloadUrl: versionCheck.versionInfo.downloadUrl || 'https://github.com',
                    updateMessage: versionCheck.versionInfo.updateMessage || '프로그램을 계속 사용하려면 최신 버전으로 업데이트해주세요.',
                    features: versionCheck.versionInfo.features || []
                };
                console.log('[UpdateHandlers] Returning version info from checkVersion:', info);
                return info;
            }

            console.log('[UpdateHandlers] No version info available');
            return null;
        } catch (error) {
            console.error('[UpdateHandlers] Failed to get update info:', error);
            return null;
        }
    });

    /**
     * 다운로드 페이지 열기
     */
    ipcMain.handle('update:open-download', async () => {
        try {
            const downloadUrl = global.versionInfo?.downloadUrl || 'https://github.com';
            console.log('[UpdateHandlers] Opening download page:', downloadUrl);
            await shell.openExternal(downloadUrl);
            return { success: true };
        } catch (error) {
            console.error('[UpdateHandlers] Failed to open download page:', error);
            return { success: false, message: error.message };
        }
    });

    /**
     * 앱 종료
     */
    ipcMain.handle('update:quit-app', () => {
        console.log('[UpdateHandlers] Quitting app...');
        app.quit();
    });

    console.log('[UpdateHandlers] Update handlers registered');
}

module.exports = { registerUpdateHandlers };
