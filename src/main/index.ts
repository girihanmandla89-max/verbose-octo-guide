import { app, BrowserWindow, ipcMain, session } from 'electron';
import * as path from 'path';
import { IpcController, CommandType } from './ipc-controller';
import { ProcessSupervisor } from './process-supervisor';

let mainWindow: BrowserWindow | null = null;
let ipcController: IpcController | null = null;
let supervisor: ProcessSupervisor | null = null;

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 1024,
        minHeight: 720,
        backgroundColor: '#0d1117',
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        },
        autoHideMenuBar: true,
        title: 'NextHyke: AI Video Engine & Virtual Camera'
    });

    // Enforce strict Content Security Policy (CSP)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:"
                ]
            }
        });
    });

    // Load renderer HTML
    const rendererPath = path.resolve(process.cwd(), 'src/renderer/index.html');
    mainWindow.loadFile(rendererPath);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function initializeApp() {
    const sessionPid = process.pid;
    console.log(`[Main] Initializing NextHyke Desktop Core with Session PID: ${sessionPid}`);

    // 1. Initialize Named Pipe Server
    ipcController = new IpcController(sessionPid);
    await ipcController.start();

    // 2. Initialize Process Supervisor
    supervisor = new ProcessSupervisor(sessionPid);

    supervisor.on('worker-log', (msg) => {
        if (mainWindow) {
            mainWindow.webContents.send('worker:log', msg);
        }
    });

    supervisor.on('worker-crashed', (info) => {
        console.error('[Main] Supervisor detected worker crash:', info);
        if (mainWindow) {
            mainWindow.webContents.send('worker:status', 'crashed');
        }
    });

    // Setup IPC Handlers
    ipcMain.handle('worker:ping', async () => {
        if (!ipcController) return { status: 'error', message: 'IPC not ready' };
        return await ipcController.sendCommand(CommandType.CMD_HEARTBEAT);
    });

    ipcMain.handle('worker:telemetry', async () => {
        if (!ipcController) return { status: 'error', message: 'IPC not ready' };
        return await ipcController.sendCommand(CommandType.CMD_GET_TELEMETRY);
    });

    ipcMain.handle('models:load', async () => {
        if (!ipcController) return { status: 'error', message: 'IPC not ready' };
        return await ipcController.sendCommand(CommandType.CMD_LOAD_MODELS);
    });

    ipcMain.handle('stream:start', async (_event, config) => {
        if (!ipcController) return { status: 'error', message: 'IPC not ready' };
        return await ipcController.sendCommand(CommandType.CMD_START_STREAM, config);
    });

    ipcMain.handle('stream:stop', async () => {
        if (!ipcController) return { status: 'error', message: 'IPC not ready' };
        return await ipcController.sendCommand(CommandType.CMD_STOP_STREAM);
    });

    ipcMain.handle('app:version', () => {
        return app.getVersion();
    });

    // 3. Start Python Worker
    supervisor.startWorker();

    // 4. Create Window
    await createWindow();
}

app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', async () => {
    console.log('[Main] Application shutting down...');
    if (ipcController && ipcController.isConnected()) {
        try {
            await ipcController.sendCommand(CommandType.CMD_SHUTDOWN, {}, 1000);
        } catch (e) {
            // Ignored on shutdown
        }
    }
    if (supervisor) {
        supervisor.stopWorker();
    }
    if (ipcController) {
        await ipcController.stop();
    }
});
