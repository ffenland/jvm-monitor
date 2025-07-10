const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { parseFileContent } = require('./parser');

const monitorPath = 'C:\\atc'; // Directory to monitor
const dataDirPath = path.join(__dirname, 'result');
const dataFilePath = path.join(dataDirPath, 'result.json'); // JSON file to store data
const originFilesPath = path.join(__dirname, 'originFiles'); // Directory for original files

let mainWindow;
let monitoredData = {}; // In-memory storage for file contents

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Using a preload script for security
            contextIsolation: true, // Recommended for security
            nodeIntegration: false // Recommended for security
        }
    });

    mainWindow.loadFile('index.html');

    // Open DevTools for debugging
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    // Load existing data from JSON file if it exists
    if (fs.existsSync(dataFilePath)) {
        try {
            monitoredData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            console.log('Loaded existing data:', monitoredData);
        } catch (error) {
            console.error('Error loading existing data:', error);
            monitoredData = {}; // Reset if corrupted
        }
    }

    // Send initial log message to renderer
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('log-message', `Monitoring directory: ${monitorPath}`);
        mainWindow.webContents.send('log-message', `Data will be saved to: ${dataFilePath}`);
    });

    const watcher = chokidar.watch(monitorPath, {
        persistent: true,
        ignoreInitial: true,
    });

    console.log(`Chokidar watcher initialized for: ${monitorPath}`);
    mainWindow.webContents.send('log-message', `Chokidar watcher initialized for: ${monitorPath}`);

    watcher.on('ready', () => {
        console.log('Chokidar: Initial scan complete. Ready for changes.');
        mainWindow.webContents.send('log-message', 'Chokidar: Initial scan complete. Ready for changes.');
    });

    watcher.on('add', (filePath) => {
        console.log(`File added: ${filePath}`);
        mainWindow.webContents.send('log-message', `File added: ${path.basename(filePath)}`);

        // --- Copy original file ---
        const fileName = path.basename(filePath);
        const destPath = path.join(originFilesPath, fileName);

        // Ensure the destination directory exists
        if (!fs.existsSync(originFilesPath)) {
            fs.mkdirSync(originFilesPath, { recursive: true });
        }

        // Copy the file
        fs.copyFile(filePath, destPath, (err) => {
            if (err) {
                console.error(`Error copying file: ${err}`);
                mainWindow.webContents.send('log-message', `Error copying file: ${err.message}`);
            } else {
                console.log(`File copied to ${destPath}`);
                mainWindow.webContents.send('log-message', `Original file saved to originFiles.`);
            }
        });
        // --- End of copy ---

        fs.readFile(filePath, (err, buffer) => {
            if (err) {
                console.error(`Error reading file ${filePath}:`, err);
                mainWindow.webContents.send('log-message', `Error reading ${path.basename(filePath)}: ${err.message}`);
                return;
            }

            let parsedContent;

            try {
                parsedContent = parseFileContent(buffer); // Pass buffer to parser
                monitoredData[fileName] = parsedContent; // Store parsed content
                console.log(`Content of ${fileName} parsed and stored.`);
                mainWindow.webContents.send('log-message', `Content of ${fileName} parsed and stored.`);
                mainWindow.webContents.send('parsed-data', parsedContent); // Send parsed data to renderer
            } catch (parseError) {
                console.error(`Error parsing file ${filePath}:`, parseError);
                const errorMessage = `Error parsing ${fileName}: ${parseError.message}`;
                mainWindow.webContents.send('log-message', errorMessage);
                monitoredData[fileName] = { error: errorMessage }; // Store error instead of content
            }

            saveDataToFile(); // Save updated data to JSON file
        });
    });

    watcher.on('error', (error) => {
        console.error(`Watcher error: ${error}`);
        mainWindow.webContents.send('log-message', `Watcher error: ${error.message}`);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function saveDataToFile() {
    // Ensure the directory exists
    if (!fs.existsSync(dataDirPath)) {
        fs.mkdirSync(dataDirPath, { recursive: true });
    }
    fs.writeFile(dataFilePath, JSON.stringify(monitoredData, null, 2), 'utf8', (err) => {
        if (err) {
            console.error('Error saving data to file:', err);
            mainWindow.webContents.send('log-message', `Error saving data: ${err.message}`);
        } else {
            console.log('Data saved to file:', dataFilePath);
            mainWindow.webContents.send('log-message', 'Data saved successfully.');
        }
    });
}