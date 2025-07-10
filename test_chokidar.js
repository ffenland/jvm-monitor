const chokidar = require('chokidar');
const path = require('path');

const monitorPath = 'C:\\test_monitor';

console.log(`[Test] Starting Chokidar monitor for: ${monitorPath}`);

const watcher = chokidar.watch(monitorPath, {
    persistent: true,
    ignoreInitial: true,
});

watcher.on('ready', () => {
    console.log('[Test] Chokidar: Initial scan complete. Ready for changes.');
});

watcher.on('add', (filePath) => {
    console.log(`[Test] File added: ${filePath}`);
});

watcher.on('change', (filePath) => {
    console.log(`[Test] File changed: ${filePath}`);
});

watcher.on('unlink', (filePath) => {
    console.log(`[Test] File unlinked: ${filePath}`);
});

watcher.on('error', (error) => {
    console.error(`[Test] Watcher error: ${error}`);
});

console.log('[Test] Chokidar setup complete. Waiting for events...');
