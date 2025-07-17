const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { parseFileContent } = require('./parser');

const monitorPath = 'C:\\atc'; // Directory to monitor
const dataDirPath = path.join(__dirname, 'result');
const originFilesPath = path.join(__dirname, 'originFiles'); // Directory for original files

let mainWindow;
let currentAvailableDates = new Set(); // To keep track of dates for dynamic updates

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

    // Send initial log message to renderer
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('log-message', `Monitoring directory: ${monitorPath}`);
        mainWindow.webContents.send('log-message', `Data will be saved to: ${dataDirPath}`);
    });

    const watcher = chokidar.watch(monitorPath, {
        persistent: true,
        ignoreInitial: true,
    });

    mainWindow.webContents.send('log-message', `Chokidar watcher initialized for: ${monitorPath}`);

    watcher.on('ready', () => {
        mainWindow.webContents.send('log-message', 'Chokidar: Initial scan complete. Ready for changes.');
    });

    watcher.on('add', (filePath) => {
        mainWindow.webContents.send('log-message', `File added: ${path.basename(filePath)}`);

        fs.readFile(filePath, (err, buffer) => {
            if (err) {
                mainWindow.webContents.send('log-message', `Error reading ${path.basename(filePath)}: ${err.message}`);
                return;
            }

            let parsedContent;
            const fileName = path.basename(filePath);

            try {
                const match = fileName.match(/Copy\d+-(\d{8})(\d{6})\.txt/);
                const preparationDate = match ? match[1] : null;

                parsedContent = parseFileContent(buffer); // Pass buffer to parser

                // Add timestamp and preparationDate to parsedContent for renderer
                const timestamp = Date.now();
                const dataToSend = { ...parsedContent, fileName, preparationDate, timestamp };

                // --- Copy original file to preparation date-specific folder ---
                if (preparationDate) {
                    const dailyOriginPath = path.join(originFilesPath, `origin_${preparationDate}`);
                    if (!fs.existsSync(dailyOriginPath)) {
                        fs.mkdirSync(dailyOriginPath, { recursive: true });
                    }
                    const destPath = path.join(dailyOriginPath, fileName);
                    fs.copyFile(filePath, destPath, (err) => {
                        if (err) {
                            console.error(`Error copying original file: ${err.message}`);
                            mainWindow.webContents.send('log-message', `Error copying original file: ${err.message}`);
                        } else {
                            mainWindow.webContents.send('log-message', `Original file saved to ${path.basename(dailyOriginPath)}.`);
                        }
                    });
                }
                // --- End of copy ---

                mainWindow.webContents.send('log-message', `Content of ${fileName} parsed and stored.`);
                mainWindow.webContents.send('parsed-data', dataToSend); // Send parsed data with fileName, preparationDate, and timestamp
                saveDataToFile(parsedContent, preparationDate); // Save the new data to the appropriate files
            } catch (parseError) {
                const errorMessage = `Error parsing ${fileName}: ${parseError.message}. Moving to error folder.`;
                console.error(errorMessage); // Added console.error
                mainWindow.webContents.send('log-message', errorMessage);

                // Move the problematic file to an error directory
                const errorDirPath = path.join(originFilesPath, 'error');
                if (!fs.existsSync(errorDirPath)) {
                    fs.mkdirSync(errorDirPath, { recursive: true });
                }
                const errorDestPath = path.join(errorDirPath, fileName);
                fs.rename(filePath, errorDestPath, (err) => {
                    if (err) {
                        console.error(`Could not move error file: ${err.message}`); // Added console.error
                        mainWindow.webContents.send('log-message', `Could not move error file: ${err.message}`);
                    }
                });
            }
        });
    });

    watcher.on('error', (error) => {
        mainWindow.webContents.send('log-message', `Watcher error: ${error.message}`);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    ipcMain.on('get-initial-data', (event) => {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const todayFilePath = path.join(dataDirPath, `prepare_${today}.json`);
        let todayData = [];
        if (fs.existsSync(todayFilePath)) {
            try {
                todayData = JSON.parse(fs.readFileSync(todayFilePath, 'utf8'));
            } catch (e) { /* ignore */ }
        }

        const availableDates = fs.readdirSync(dataDirPath)
            .filter(file => file.startsWith('prepare_') && file.endsWith('.json'))
            .map(file => file.substring(8, 16)) // 'prepare_'.length, 'prepare_YYYYMMDD'.length
            .sort((a, b) => b.localeCompare(a)); // Sort descending
        
        currentAvailableDates = new Set(availableDates); // Initialize the set of available dates

        event.sender.send('initial-data', { data: todayData, dates: availableDates, today: today });
    });

    ipcMain.on('get-data-for-date', (event, date) => {
        const filePath = path.join(dataDirPath, `prepare_${date}.json`);
        let data = [];
        if (fs.existsSync(filePath)) {
            try {
                data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) { /* ignore */ }
        }
        event.sender.send('data-for-date', data);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function saveDataToFile(newData, preparationDate) {
    // Save to result_{receiptDate}.json
    if (newData && newData.receiptDateRaw) {
        const receiptDate = newData.receiptDateRaw;
        const resultFilePath = path.join(dataDirPath, `result_${receiptDate}.json`);
        writeDataToDailyFile(resultFilePath, newData);
    } else {
        mainWindow.webContents.send('log-message', 'Error: Cannot save result data without a receipt date.');
    }

    // Save to prepare_{preparationDate}.json
    if (newData && preparationDate) {
        const prepareFilePath = path.join(dataDirPath, `prepare_${preparationDate}.json`);
        const isNewDate = !currentAvailableDates.has(preparationDate); // Check if it's a new date
        
        writeDataToDailyFile(prepareFilePath, newData);

        if (isNewDate) {
            currentAvailableDates.add(preparationDate);
            const updatedDates = Array.from(currentAvailableDates).sort((a, b) => b.localeCompare(a));
            mainWindow.webContents.send('update-date-list', updatedDates);
            mainWindow.webContents.send('log-message', `New date ${preparationDate} added. Updating date list.`);
        }
    } else {
        mainWindow.webContents.send('log-message', 'Error: Cannot save prepare data without a preparation date.');
    }
}

function writeDataToDailyFile(filePath, newData) {
    try {
        // Ensure the directory exists
        if (!fs.existsSync(dataDirPath)) {
            fs.mkdirSync(dataDirPath, { recursive: true });
        }

        let dailyData = [];
        if (fs.existsSync(filePath)) {
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                dailyData = JSON.parse(fileContent);
                if (!Array.isArray(dailyData)) {
                    dailyData = []; // Reset if not an array
                }
            } catch (error) {
                dailyData = []; // Reset on read error
            }
        }

        dailyData.push(newData);

        fs.writeFileSync(filePath, JSON.stringify(dailyData, null, 2), 'utf8');
        mainWindow.webContents.send('log-message', `Data saved successfully to ${path.basename(filePath)}.`);
    } catch (err) {
        mainWindow.webContents.send('log-message', `Error saving data to ${path.basename(filePath)}: ${err.message}`);
    }
}
