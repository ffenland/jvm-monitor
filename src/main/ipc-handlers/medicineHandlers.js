const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const { fetchAndSaveMedicine } = require('../../../medicine-fetcher');

/**
 * 약품 관련 IPC 핸들러
 */
function registerMedicineHandlers(dbManager, getMainWindow) {
    // 약품 정보 조회
    ipcMain.handle('get-medicine-info', async (event, medicineCode) => {
        try {
            // medicineCode는 bohcode일 가능성이 높음
            const medicineInfo = dbManager.getMedicineByBohcode(medicineCode);
            return { success: true, medicineInfo };
        } catch (error) {
            console.error('Error getting medicine info:', error);
            return { success: false, error: error.message };
        }
    });

    // 커스텀 라벨 편집 창 열기
    ipcMain.handle('open-custom-label-editor', async () => {
        try {
            const mainWindow = getMainWindow();
            const customLabelWindow = new BrowserWindow({
                width: 450,
                height: 750,
                parent: mainWindow,
                icon: path.join(__dirname, '../../../build', 'icon.ico'),
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            customLabelWindow.setMenuBarVisibility(false);
            customLabelWindow.setMenu(null);
            customLabelWindow.loadFile(path.join(__dirname, '../../../custom-label-editor.html'));

            return { success: true };
        } catch (error) {
            console.error('Error opening custom label editor:', error);
            return { success: false, error: error.message };
        }
    });

    // 약품설정 창 열기
    ipcMain.handle('open-medicine-settings', async (event, medicineCode = null) => {
        try {
            const mainWindow = getMainWindow();
            const settingsWindow = new BrowserWindow({
                width: 1200,
                height: 800,
                parent: mainWindow,
                icon: path.join(__dirname, '../../../build', 'icon.ico'),
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            settingsWindow.setMenuBarVisibility(false);
            settingsWindow.setMenu(null);

            const htmlPath = path.join(__dirname, '../../../medicine-settings.html');

            // medicineCode가 제공되면 query parameter로 전달
            if (medicineCode) {
                settingsWindow.loadFile(htmlPath, {
                    query: {
                        medicineCode: medicineCode
                    }
                });
            } else {
                settingsWindow.loadFile(htmlPath);
            }

            return { success: true };
        } catch (error) {
            console.error('Error opening medicine settings:', error);
            return { success: false, error: error.message };
        }
    });

    // api_fetched = 0인 약품 목록 조회
    ipcMain.handle('get-incomplete-medicines', async () => {
        try {
            const medicines = dbManager.getAllMedicineFails();

            // bohcode 정보 추가
            const medicinesWithBohcode = medicines.map(medicine => {
                const bohcodes = dbManager.getBohcodesByYakjungCode(medicine.yakjung_code);
                return {
                    ...medicine,
                    bohcode: bohcodes.length > 0 ? bohcodes[0] : null
                };
            });

            return { success: true, medicines: medicinesWithBohcode };
        } catch (error) {
            console.error('Error getting incomplete medicines:', error);
            return { success: false, error: error.message };
        }
    });

    // 약품 정보 업데이트 (사용자 수동 입력)
    ipcMain.handle('update-medicine-info', async (_event, medicineData) => {
        try {
            // 사용자가 직접 입력한 데이터를 그대로 저장
            const result = dbManager.updateMedicineManually(
                medicineData.yakjung_code,
                medicineData
            );

            return { success: true, medicine: result };
        } catch (error) {
            console.error('Error updating medicine:', error);
            return { success: false, error: error.message };
        }
    });

    // 단일 약품 정보 조회 (code는 bohcode)
    ipcMain.handle('get-single-medicine', async (event, code) => {
        try {
            const medicine = dbManager.getMedicineByBohcode(code);
            return { success: true, medicine };
        } catch (error) {
            console.error('약품 조회 실패:', error);
            return { success: false, error: error.message };
        }
    });

    // 약품 상세정보 조회 (모달용, code는 bohcode)
    ipcMain.handle('get-medicine-detail', async (event, code) => {
        try {
            const medicine = dbManager.getMedicineByBohcode(code);
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

    // 약품 정보 자동 입력 (API 재요청, medicineCode는 bohcode)
    ipcMain.handle('auto-fill-medicine', async (event, medicineCode) => {
        try {
            // 약품명 찾기: medicines 테이블에서 조회 (bohcode로)
            const existingMedicine = dbManager.getMedicineByBohcode(medicineCode);
            const medicineName = existingMedicine ? existingMedicine.drug_name : null;

            // API로 약품 정보 재조회
            const result = await fetchAndSaveMedicine(medicineCode, medicineName, dbManager);

            if (result.success && !result.apiFailure) {
                return {
                    success: true,
                    message: '정상적으로 저장했습니다.',
                    medicine: result.medicine
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

    // 약품 검색 (기존 - 레거시)
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

    // 전체 약품 검색 (약품명 또는 bohcode로 검색)
    ipcMain.handle('search-all-medicines', async (event, searchTerm) => {
        try {
            // 1. medicines 테이블에서 약품명으로 검색
            const nameResults = dbManager.db.prepare(`
                SELECT * FROM medicines
                WHERE drug_name LIKE ?
                ORDER BY drug_name
                LIMIT 100
            `).all(`%${searchTerm}%`);

            // 각 약품에 bohcode 정보 추가
            const nameResultsWithBohcode = nameResults.map(medicine => {
                const bohcodes = dbManager.getBohcodesByYakjungCode(medicine.yakjung_code);
                return {
                    ...medicine,
                    bohcode: bohcodes.length > 0 ? bohcodes[0] : null
                };
            });

            // 2. bohcode로 검색 (medicine_bohcodes 테이블 조인)
            const bohcodeResults = dbManager.db.prepare(`
                SELECT m.*, mb.bohcode
                FROM medicines m
                INNER JOIN medicine_bohcodes mb ON m.yakjung_code = mb.yakjung_code
                WHERE mb.bohcode LIKE ?
                ORDER BY m.drug_name
                LIMIT 100
            `).all(`%${searchTerm}%`);

            // 중복 제거: yakjung_code 기준으로 합치기
            const resultMap = new Map();

            // 약품명 검색 결과 추가
            nameResultsWithBohcode.forEach(item => {
                resultMap.set(item.yakjung_code, item);
            });

            // bohcode 검색 결과 추가 (중복되지 않는 것만)
            bohcodeResults.forEach(item => {
                if (!resultMap.has(item.yakjung_code)) {
                    resultMap.set(item.yakjung_code, item);
                }
            });

            const medicines = Array.from(resultMap.values());

            return { success: true, medicines };
        } catch (error) {
            console.error('전체 약품 검색 실패:', error);
            return { success: false, error: error.message, medicines: [] };
        }
    });

    // medicine.json 목록 조회 (레거시)
    ipcMain.handle('get-medicine-list', async () => {
        const fs = require('fs');
        try {
            const medicineJsonPath = path.join(__dirname, '../../../db', 'medicine.json');
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

    // 약품 검색 창 열기
    ipcMain.handle('open-medicine-search', async (event, params) => {
        try {
            // params는 { keyword, oldYakjungCode } 형태
            const keyword = typeof params === 'string' ? params : params.keyword;
            const oldYakjungCode = typeof params === 'object' ? params.oldYakjungCode : null;

            // 요청한 창(약품설정 창)을 부모로 설정
            const parentWindow = BrowserWindow.fromWebContents(event.sender);

            const searchWindow = new BrowserWindow({
                width: 900,
                height: 700,
                parent: parentWindow,
                modal: true,
                icon: path.join(__dirname, '../../../build', 'icon.ico'),
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            searchWindow.setMenuBarVisibility(false);
            searchWindow.setMenu(null);

            // keyword와 oldYakjungCode를 URL 파라미터로 전달
            const htmlPath = path.join(__dirname, '../../../medicine-search.html');
            searchWindow.loadFile(htmlPath, {
                query: {
                    keyword: keyword || '',
                    oldYakjungCode: oldYakjungCode || ''
                }
            });

            // 검색 완료 알림을 부모 창과 메인 창으로 전달하는 핸들러 (일회성)
            const completeHandler = () => {
                // 약품설정 창(부모) 리프레쉬
                if (parentWindow && !parentWindow.isDestroyed()) {
                    parentWindow.webContents.send('medicine-search-complete');
                }

                // 메인 창에도 약품 정보 업데이트 알림
                const mainWindow = getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('medicine-data-updated');
                }
            };

            ipcMain.once('medicine-search-complete', completeHandler);

            // 창이 닫힐 때 핸들러 정리
            searchWindow.on('closed', () => {
                ipcMain.removeListener('medicine-search-complete', completeHandler);
            });

            return { success: true };
        } catch (error) {
            console.error('Error opening medicine search:', error);
            return { success: false, error: error.message };
        }
    });

    // 약품명으로 검색 (약학정보원 API)
    ipcMain.handle('search-medicine-by-name', async (event, medicineName) => {
        try {
            const { searchMedicineByName } = require('../../../scripts/search-by-name');
            const results = await searchMedicineByName(medicineName);
            return { success: true, medicines: results };
        } catch (error) {
            console.error('약품명 검색 실패:', error);
            return { success: false, error: error.message, medicines: [] };
        }
    });

    // 약학정보원 코드로 상세 정보 조회 및 DB 저장
    ipcMain.handle('fetch-medicine-detail-from-yakjungwon', async (event, oldYakjungCode, newYakjungCode) => {
        try {
            console.log('[DEBUG] oldYakjungCode:', oldYakjungCode);
            console.log('[DEBUG] newYakjungCode:', newYakjungCode);

            const { fetchMedicineDetailByYakjungCode } = require('../../../scripts/search-by-name');
            const medicineData = await fetchMedicineDetailByYakjungCode(newYakjungCode);

            console.log('[DEBUG] Fetched medicine data:', JSON.stringify(medicineData, null, 2));

            // DB에 저장 (yakjung_code 변경하면서 업데이트)
            const result = dbManager.replaceMedicineWithNewYakjungCode(
                oldYakjungCode,
                newYakjungCode,
                medicineData
            );

            console.log('[DEBUG] DB 저장 완료:', result.yakjung_code);

            return { success: true, medicine: result };
        } catch (error) {
            console.error('약품 상세정보 조회 및 저장 실패:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerMedicineHandlers };
