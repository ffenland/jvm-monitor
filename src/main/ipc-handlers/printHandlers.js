const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { printWithBrother, getBrotherPrinters } = require('../../services/print_brother');
const { processPrescriptionData } = require('../../services/dataProcessor');
const DatabaseManager = require('../../services/database');

/**
 * 프린터 및 출력 관련 IPC 핸들러
 */
function registerPrintHandlers(dbManager, getMainWindow, loadConfig) {
    // 프린터 목록 가져오기
    ipcMain.on('get-printers', async (event) => {
        const mainWindow = getMainWindow();
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

    // Brother 프린터 목록 가져오기 (handle 버전)
    ipcMain.handle('get-brother-printers', async () => {
        try {
            const printers = await getBrotherPrinters();
            return { success: true, printers };
        } catch (error) {
            console.error('Error getting printers:', error);
            return { success: false, error: error.message, printers: [] };
        }
    });

    // 처방전 출력
    ipcMain.handle('print-prescription', async (event, prescriptionData, printerName) => {
        try {
            // 데이터 가공 - dataProcessor 모듈 사용
            const processedData = processPrescriptionData(prescriptionData);

            // 템플릿 파일 경로
            const templatesDir = DatabaseManager.getTemplatesDir();
            const templatePath = path.join(templatesDir, 'prescription_label.lbx');

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

    // 라벨 편집 창 열기
    ipcMain.handle('open-label-editor', async (event, prescriptionData, medicineCode) => {
        try {
            const mainWindow = getMainWindow();
            // DB에서 약품 정보 가져오기 (medicineCode는 bohcode)
            const medicineInfo = dbManager.getMedicineByBohcode(medicineCode);

            // 편집 창 생성 - 스크롤 없이 볼 수 있도록 높이 조정
            const editorWindow = new BrowserWindow({
                width: 420,
                height: 900,
                parent: mainWindow,
                modal: true,
                icon: path.join(__dirname, '../../../build', 'icon.ico'), // 아이콘 설정
                autoHideMenuBar: true, // 메뉴바 숨기기
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    devTools: false
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

            editorWindow.loadFile(path.join(__dirname, '../../views/label-editor.html'), {
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
                const templatesDir = DatabaseManager.getTemplatesDir();
                templatePath = path.join(templatesDir, 'default.lbx');
            }

            // 약품 정보 업데이트 체크 (SQLite DB 사용)
            if (printData.medicineCode) {
                try {
                    // medicineCode(bohcode)로 yakjung_code 조회
                    const bohcodeInfo = dbManager.getBohcode(printData.medicineCode);
                    if (bohcodeInfo) {
                        const yakjungCode = bohcodeInfo.yakjung_code;

                        // custom_usage 저장
                        if (printData.saveCustomUsage && printData.customUsage) {
                            dbManager.updateMedicineCustomUsage(yakjungCode, printData.customUsage);
                            console.log(`Custom usage saved for ${yakjungCode}: ${printData.customUsage}`);
                        }

                        // unit 업데이트
                        if (printData.updateUnit && printData.unit) {
                            dbManager.updateMedicineUnit(yakjungCode, printData.unit);
                            console.log(`Unit updated for ${yakjungCode}: ${printData.unit}`);
                        }

                        // 기존 필드 업데이트 (필요 시)
                        const existingMedicine = dbManager.getMedicine(yakjungCode);
                        if (existingMedicine && (printData.updateMedicineType || printData.updateMedicineName)) {
                            const updateStmt = dbManager.db.prepare(`
                                UPDATE medicines
                                SET cls_code = ?, drug_name = ?, updatedAt = CURRENT_TIMESTAMP
                                WHERE yakjung_code = ?
                            `);

                            updateStmt.run(
                                printData.updateMedicineType ? printData.medicineType : existingMedicine.cls_code,
                                printData.updateMedicineName ? printData.name : existingMedicine.drug_name,
                                yakjungCode
                            );
                        }
                    }
                } catch (updateError) {
                    console.error('Error updating medicine info in DB:', updateError);
                    // 업데이트 실패해도 출력은 계속 진행
                }
            }

            // 라벨 데이터 가공
            // 필요한 값들 추출
            const unit = printData.unit || printData.medicineInfo?.unit || '정';
            const storageTemp = printData.medicineInfo?.temperature || '';

            // 총량: 사용자가 입력한 값 그대로 사용
            const totalAmount = printData.totalAmount || '';

            const processedData = {
                patientName: printData.patientName,
                medicineName: `[${printData.medicineInfo?.drug_name || printData.name}]`,
                medicineType: printData.medicineType,
                dose: printData.dosageText,
                prescriptionDays: printData.prescriptionDays + '일분',
                madeDate: `조제일 ${new Date().toLocaleDateString('ko-KR')}`,
                pharmacy: config.pharmacyName,
                totalCount: `총${totalAmount}${unit}`,
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

    // 라벨 출력 (on 버전)
    ipcMain.on('print-label', async (event, printData) => {
        const mainWindow = getMainWindow();
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
}

module.exports = { registerPrintHandlers };
