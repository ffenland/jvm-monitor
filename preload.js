const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onLogMessage: (callback) => ipcRenderer.on('log-message', (event, message) => callback(message)),
    onParsedData: (callback) => ipcRenderer.on('parsed-data', (event, data) => callback(data))
});
