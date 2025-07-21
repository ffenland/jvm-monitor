const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onLogMessage: (callback) => ipcRenderer.on('log-message', (event, message) => callback(message)),
    onParsedData: (callback) => ipcRenderer.on('parsed-data', (event, data) => callback(data)),
    getInitialData: () => ipcRenderer.send('get-initial-data'),
    onInitialData: (callback) => ipcRenderer.on('initial-data', (event, payload) => callback(payload)),
    getDataForDate: (date) => ipcRenderer.send('get-data-for-date', date),
    onDataForDate: (callback) => ipcRenderer.on('data-for-date', (event, data) => callback(data)),
    onUpdateDateList: (callback) => ipcRenderer.on('update-date-list', (event, dates) => callback(dates))
});
