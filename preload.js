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
    printMedicineLabel: (labelData, printerName) => ipcRenderer.invoke('print-medicine-label', labelData, printerName),
    // 설정 관련 API
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    getTemplates: () => ipcRenderer.invoke('get-templates'),
    checkTemplateFields: (templatePath) => ipcRenderer.invoke('check-template-fields', templatePath),
    // 라벨 편집 창 API
    openLabelEditor: (prescriptionData, medicineCode) => ipcRenderer.invoke('open-label-editor', prescriptionData, medicineCode)
});
