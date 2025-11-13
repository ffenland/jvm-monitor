const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getInitialData: () => ipcRenderer.send('get-initial-data'),
    getDataForDate: (date) => ipcRenderer.send('get-data-for-date', date),
    sendPrintLabel: (data) => ipcRenderer.send('print-label', data),
    getPrinters: () => ipcRenderer.send('get-printers'),
    onInitialData: (callback) => ipcRenderer.on('initial-data', (_event, value) => callback(value)),
    onDataForDate: (callback) => ipcRenderer.on('data-for-date', (_event, value) => callback(value)),
    onParsedData: (callback) => ipcRenderer.on('parsed-data', (_event, value) => callback(value)),
    onParsedDataLoading: (callback) => ipcRenderer.on('parsed-data-loading', (_event, value) => callback(value)),
    onUpdateDateList: (callback) => ipcRenderer.on('update-date-list', (_event, value) => callback(value)),
    onPrintLabelResult: (callback) => ipcRenderer.on('print-label-result', (_event, value) => callback(value)),
    onPrinterList: (callback) => ipcRenderer.on('printer-list', (_event, value) => callback(value)),
    onLogMessage: (callback) => ipcRenderer.on('log-message', (_event, value) => callback(value)),
    // 새로운 Brother 프린터 API
    getBrotherPrinters: () => ipcRenderer.invoke('get-brother-printers'),
    printPrescription: (prescriptionData, printerName) => ipcRenderer.invoke('print-prescription', prescriptionData, printerName),
    printFromEditor: (printData) => ipcRenderer.invoke('print-from-editor', printData),
    // 설정 관련 API
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    getTemplates: () => ipcRenderer.invoke('get-templates'),
    checkTemplateFields: (templatePath) => ipcRenderer.invoke('check-template-fields', templatePath),
    // 라벨 편집 창 API
    openLabelEditor: (prescriptionData, medicineCode) => ipcRenderer.invoke('open-label-editor', prescriptionData, medicineCode),
    // 약품 설정 창 API
    openMedicineSettings: (medicineCode) => ipcRenderer.invoke('open-medicine-settings', medicineCode),
    // 신규약품 추가 창 API
    openAddNewMedicine: () => ipcRenderer.invoke('open-add-new-medicine'),
    // 커스텀 라벨 편집 창 API
    openCustomLabelEditor: () => ipcRenderer.invoke('open-custom-label-editor'),
    // 약학정보원 검색 창 API
    openYakjungSearch: (params) => ipcRenderer.invoke('open-yakjung-search', params),
    // 템플릿 미리보기 API
    previewTemplate: (templatePath) => ipcRenderer.invoke('preview-template', templatePath),
    // 약품 정보 조회
    getMedicineList: () => ipcRenderer.invoke('get-medicine-list'),
    // 약품 설정 API
    searchMedicine: (searchTerm) => ipcRenderer.invoke('search-medicine', searchTerm),
    getSingleMedicine: (code) => ipcRenderer.invoke('get-single-medicine', code),
    updateMedicine: (medicineData) => ipcRenderer.invoke('update-medicine', medicineData),
    // 미완성 약품 관련 API
    getMedicineFails: () => ipcRenderer.invoke('get-medicine-fails'),
    getMedicineFailCount: () => ipcRenderer.invoke('get-medicine-fail-count'),
    autoFillMedicine: (code) => ipcRenderer.invoke('auto-fill-medicine', code),
    // 약품 상세정보 API
    getMedicineDetail: (code) => ipcRenderer.invoke('get-medicine-detail', code),
    // 폴더 선택 API
    selectFolder: (defaultPath) => ipcRenderer.invoke('select-folder', defaultPath),
    // b-PAC 상태 처리
    onBpacStatus: (callback) => ipcRenderer.on('bpac-status', (_event, value) => callback(value)),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    // 첫 실행 체크
    checkFirstRun: () => ipcRenderer.invoke('check-first-run'),
    // 초기 설정 표시 이벤트
    onShowInitialSetup: (callback) => ipcRenderer.on('show-initial-setup', (_event) => callback()),
    // API 에러 처리
    onApiError: (callback) => ipcRenderer.on('api-error', (_event, value) => callback(value)),
    // 약품 정보 업데이트 이벤트
    onMedicineDataUpdated: (callback) => ipcRenderer.on('medicine-data-updated', (_event) => callback()),
    // 자동 인쇄 이벤트
    onAutoPrintMedicines: (callback) => ipcRenderer.on('auto-print-medicines', (_event, value) => callback(value)),
    // OCS 경로 경고 이벤트
    onOcsPathWarning: (callback) => ipcRenderer.on('ocs-path-warning', (_event, message) => callback(message)),
    // 검증 실패 경고 이벤트
    onValidationWarning: (callback) => ipcRenderer.on('show-validation-warning', (_event, data) => callback(data)),
    // 처방전 삭제 API
    deletePrescription: (prescriptionId) => ipcRenderer.invoke('delete-prescription', prescriptionId),
    // 업데이트 관련 API
    getUpdateInfo: () => ipcRenderer.invoke('update:get-info'),
    openDownloadPage: () => ipcRenderer.invoke('update:open-download'),
    quitApp: () => ipcRenderer.invoke('update:quit-app'),
    // 로그 관련 API
    getAppLogs: () => ipcRenderer.invoke('get-app-logs'),
    exportAppLogs: () => ipcRenderer.invoke('export-app-logs'),
    deleteAllAppLogs: () => ipcRenderer.invoke('delete-all-app-logs'),
    sendErrorsToFirebase: () => ipcRenderer.invoke('send-errors-to-firebase')
});

// 인증 관련 API (별도 노출)
contextBridge.exposeInMainWorld('authAPI', {
    verifyLicense: (data) => ipcRenderer.invoke('auth:verify-license', data),
    getLocalLicense: () => ipcRenderer.invoke('auth:get-local-license'),
    authSuccess: () => ipcRenderer.send('auth:success'),
    closeApp: () => ipcRenderer.send('auth:close-app')
});
