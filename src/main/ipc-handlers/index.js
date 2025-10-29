const { registerPrescriptionHandlers } = require('./prescriptionHandlers');
const { registerMedicineHandlers } = require('./medicineHandlers');
const { registerPrintHandlers } = require('./printHandlers');
const { registerConfigHandlers } = require('./configHandlers');

/**
 * 모든 IPC 핸들러를 등록하는 통합 함수
 *
 * @param {Object} dependencies - 핸들러들이 필요로 하는 의존성
 * @param {DatabaseManager} dependencies.dbManager - 데이터베이스 매니저 인스턴스
 * @param {Function} dependencies.getMainWindow - 메인 윈도우 인스턴스를 반환하는 함수
 * @param {Function} dependencies.loadConfig - 설정을 로드하는 함수
 * @param {Function} dependencies.saveConfig - 설정을 저장하는 함수
 * @param {Function} dependencies.getPowerShellPath - PowerShell 경로를 반환하는 함수
 * @param {Function} dependencies.restartFileWatcher - 파일 감시를 재시작하는 함수
 */
function registerAllHandlers(dependencies) {
    const {
        dbManager,
        getMainWindow,
        loadConfig,
        saveConfig,
        getPowerShellPath,
        restartFileWatcher
    } = dependencies;

    // 각 카테고리별 핸들러 등록
    registerPrescriptionHandlers(dbManager, getMainWindow);
    registerMedicineHandlers(dbManager, getMainWindow);
    registerPrintHandlers(dbManager, getMainWindow, loadConfig);
    registerConfigHandlers(getMainWindow, loadConfig, saveConfig, getPowerShellPath, restartFileWatcher);

    console.log('All IPC handlers registered successfully');
}

module.exports = { registerAllHandlers };
