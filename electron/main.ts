import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fork } from 'child_process';
import { autoUpdater } from 'electron-updater';
import { fileURLToPath } from 'url';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let serverProcess: any = null;

// Configure Auto Updater
autoUpdater.logger = console;
autoUpdater.autoDownload = true;

function startServer() {
  const serverPath = path.join(__dirname, '..', 'dist-server', 'index.js');
  
  // Fork the server process
  // We use fork so it runs in a separate Node process, non-blocking the UI
  serverProcess = fork(serverPath, [], {
    env: { ...process.env, PORT: '3000' },
    stdio: 'inherit' // Pipe logs to main console
  });

  console.log('Backend server started with PID:', serverProcess.pid);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'LimRM Geo Analyzer',
    icon: path.join(__dirname, '..', 'dist', 'favicon.svg'), // Ensure favicon exists in dist
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // We'll create a dummy preload
    }
  });

  // Load the local server URL
  // We wait a bit or just load. Express usually starts fast.
  // Ideally, use 'wait-on' logic, but a small delay or retry in frontend works.
  // For production UX, loading the URL immediately is fine; the server will catch up.
  
  // In dev mode, we might want to load Vite dev server, but for simplicity
  // let's assume we always run the full stack via the local server in this setup
  // or load localhost:3000 where our server is serving the static files.
  
  setTimeout(() => {
      mainWindow?.loadURL('http://localhost:3000');
  }, 1000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Check for updates
  if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
  }
}

app.on('ready', () => {
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  // FIX: Cast process to any to avoid "Property 'platform' does not exist on type 'Process'" error
  if ((process as any).platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

// Auto-updater events
autoUpdater.on('update-available', () => {
  if(mainWindow) mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
  if(mainWindow) mainWindow.webContents.send('update_downloaded');
  // Silently install on quit or prompt user
});