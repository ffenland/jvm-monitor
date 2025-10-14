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
    diagnoseBPac: () => ipcRenderer.invoke('diagnose-bpac'),
    // 설정 관련 API
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    getTemplates: () => ipcRenderer.invoke('get-templates'),
    checkTemplateFields: (templatePath) => ipcRenderer.invoke('check-template-fields', templatePath),
    // 라벨 편집 창 API
    openLabelEditor: (prescriptionData, medicineCode) => ipcRenderer.invoke('open-label-editor', prescriptionData, medicineCode),
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
    onApiError: (callback) => ipcRenderer.on('api-error', (_event, value) => callback(value))
});
