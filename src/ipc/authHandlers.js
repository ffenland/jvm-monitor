const { ipcMain, app } = require('electron');
const { verifyLicense, saveLicenseToLocal } = require('../services/authService');

/**
 * 인증 관련 IPC 핸들러 등록
 */
function registerAuthHandlers(db) {
    /**
     * 라이선스 인증
     */
    ipcMain.handle('auth:verify-license', async (event, data) => {
        try {
            // Firestore 인증
            const result = await verifyLicense(
                data.pharmacyName,
                data.ownerName,
                data.email,
                data.licenseKey
            );

            if (result.success) {
                // 로컬 DB에 저장
                const saved = saveLicenseToLocal(db, result.data);

                if (saved) {
                    return {
                        success: true,
                        message: '인증 성공'
                    };
                } else {
                    return {
                        success: false,
                        message: '인증은 성공했으나 로컬 저장에 실패했습니다.'
                    };
                }
            } else {
                return result;
            }
        } catch (error) {
            return {
                success: false,
                message: '인증 처리 중 오류가 발생했습니다: ' + error.message
            };
        }
    });

    /**
     * 로컬 라이선스 조회
     */
    ipcMain.handle('auth:get-local-license', async () => {
        try {
            const license = db.getLicense();
            return {
                success: true,
                license: license
            };
        } catch (error) {
            return {
                success: false,
                message: error.message
            };
        }
    });

    /**
     * 앱 종료
     */
    ipcMain.on('auth:close-app', () => {
        app.quit();
    });
}

module.exports = { registerAuthHandlers };
