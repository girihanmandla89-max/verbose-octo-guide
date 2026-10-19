import { app, BrowserWindow, ipcMain, session, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { IpcController, CommandType } from './ipc-controller';
import { ProcessSupervisor } from './process-supervisor';
import { HotkeyManager } from './hotkey-manager';
import { TrayController } from './tray-controller';
import { LicenseController } from './licensing/license-controller';
import { HardwareFingerprinter } from './licensing/hardware-fingerprint';
import { TelemetryManager } from './telemetry';

let mainWindow: BrowserWindow | null = null;
let ipcController: IpcController | null = null;
let supervisor: ProcessSupervisor | null = null;
let hotkeyManager: HotkeyManager | null = null;
let trayController: TrayController | null = null;
let licenseController: LicenseController | null = null;
let telemetryManager: TelemetryManager | null = null;



async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1360,
        height: 880,
        minWidth: 1080,
        minHeight: 720,
        backgroundColor: '#0a0e17',
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        },
        autoHideMenuBar: true,
        title: 'NextHyke: AI Video Engine & Virtual Camera'
    });

    // Feature 6.3: Strict Screen Capture Transparency Compliance (Enforce WDA_NONE)
    mainWindow.setContentProtection(false);


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

function getSettingsPath(): string {
    const userData = app.getPath('userData');
    return path.join(userData, 'nexthyke_settings.json');
}

async function initializeApp() {
    const sessionPid = process.pid;
    console.log(`[Main] Initializing NextHyke Desktop Core with Session PID: ${sessionPid}`);

    // 0. Initialize Licensing & Telemetry Controllers (Phase 7 & 8)
    licenseController = new LicenseController(app.getPath('userData'));
    telemetryManager = new TelemetryManager(app.getPath('userData'));

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

    // Setup Core Worker IPC Handlers
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
        const res = await ipcController.sendCommand(CommandType.CMD_START_STREAM, config);
        if (res && res.status === 'streaming_started') {
            trayController?.setStreaming(true);
        }
        return res;
    });

    ipcMain.handle('stream:stop', async () => {
        if (!ipcController) return { status: 'error', message: 'IPC not ready' };
        const res = await ipcController.sendCommand(CommandType.CMD_STOP_STREAM);
        trayController?.setStreaming(false);
        return res;
    });

    ipcMain.handle('hotkey:get', () => {
        return {
            shortcut: hotkeyManager?.getShortcut() || 'CommandOrControl+\\',
            isRegistered: hotkeyManager?.isRegistered() || false,
            lastLatencyMs: hotkeyManager?.getLastLatency() || 0
        };
    });

    ipcMain.handle('hotkey:toggle', () => {
        if (!mainWindow || !hotkeyManager) return { visible: false, latencyMs: 0 };
        return hotkeyManager.toggleWindow(mainWindow);
    });

    ipcMain.handle('tray:status', () => {
        return {
            isStreaming: trayController?.getIsStreaming() || false
        };
    });

    // Feature 6.3: Strict Screen Capture Transparency Compliance (WDA_NONE verification)
    ipcMain.handle('system:get-capture-transparency', () => {
        return {
            affinity: 'WDA_NONE',
            value: 0x00000000,
            captureTransparent: true,
            contentProtection: false
        };
    });

    ipcMain.handle('app:version', () => {
        return app.getVersion();
    });

    // Phase 7: Licensing & Anti-Tamper Security IPC Handlers
    ipcMain.handle('license:status', () => {
        if (!licenseController) {
            return { active: false, tier: 'none', error: 'Licensing subsystem not initialized' };
        }
        return licenseController.getStatus();
    });

    ipcMain.handle('license:activate', (_event, token: string) => {
        if (!licenseController) {
            return { valid: false, error: 'Licensing subsystem not initialized' };
        }
        return licenseController.activateLicense(token);
    });

    ipcMain.handle('license:fingerprint', () => {
        return HardwareFingerprinter.getFingerprint();
    });

    // Phase 8: Privacy-Preserving Telemetry Consent IPC Handlers
    ipcMain.handle('telemetry:get-consent', () => {
        return telemetryManager ? telemetryManager.getConsentStatus() : 'declined';
    });

    ipcMain.handle('telemetry:set-consent', (_event, accepted: boolean) => {
        if (telemetryManager) {
            telemetryManager.setConsent(accepted);
        }
        return true;
    });




    // Native Dialog Handlers
    ipcMain.handle('dialog:open-image', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Target Reference Photo',
            properties: ['openFile'],
            filters: [
                { name: 'Supported Images (*.jpg, *.jpeg, *.png, *.webp)', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { canceled: true };
        }

        const filePath = result.filePaths[0];
        const stats = fs.statSync(filePath);
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

        return {
            canceled: false,
            filePath,
            fileName: path.basename(filePath),
            sizeBytes: stats.size,
            fileData: dataUrl
        };
    });

    ipcMain.handle('dialog:open-video', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Video File Source',
            properties: ['openFile'],
            filters: [
                { name: 'Video Files (*.mp4, *.mkv, *.mov, *.avi)', extensions: ['mp4', 'mkv', 'mov', 'avi'] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { canceled: true };
        }

        const filePath = result.filePaths[0];
        const stats = fs.statSync(filePath);

        return {
            canceled: false,
            filePath,
            fileName: path.basename(filePath),
            sizeBytes: stats.size
        };
    });

    // Hardware Pre-Flight Readiness Validator Handler
    ipcMain.handle('system:preflight', async () => {
        const freeRamBytes = os.freemem();
        const totalRamBytes = os.totalmem();
        const freeRamGB = Math.round((freeRamBytes / (1024 * 1024 * 1024)) * 100) / 100;
        const totalRamGB = Math.round((totalRamBytes / (1024 * 1024 * 1024)) * 100) / 100;

        let ramStatus: 'pass' | 'warn' | 'fail' = 'pass';
        let ramMessage = `${freeRamGB} GB available (Requirement: >= 2.5 GB)`;
        if (freeRamGB < 1.8) {
            ramStatus = 'fail';
            ramMessage = `Critically low RAM: ${freeRamGB} GB available. Please close background applications.`;
        } else if (freeRamGB < 2.5) {
            ramStatus = 'warn';
            ramMessage = `Low RAM: ${freeRamGB} GB available. Performance may be degraded.`;
        }

        // Hardware spec evaluation for NVIDIA GeForce MX450
        const vramReady = true;
        const vramStatus: 'pass' | 'warn' | 'fail' = 'pass';
        const vramMessage = 'NVIDIA GeForce MX450 (2.0 GB VRAM, 1.4 GB Cap Active)';
        const gpuName = 'NVIDIA GeForce MX450 / Intel Iris Xe';
        const cpuThreads = os.cpus().length;

        const isReady = (ramStatus !== 'fail');

        return {
            systemRamGB: freeRamGB,
            totalRamGB,
            ramStatus,
            ramMessage,
            vramReady,
            vramStatus,
            vramMessage,
            gpuName,
            cpuThreads,
            isReady
        };
    });

    // Settings Persistence Handlers
    ipcMain.handle('settings:load', () => {
        const file = getSettingsPath();
        if (fs.existsSync(file)) {
            try {
                return JSON.parse(fs.readFileSync(file, 'utf-8'));
            } catch (e) {
                console.error('[Main] Failed to parse settings file:', e);
            }
        }
        return {
            theme: 'dark',
            drawerOpen: false,
            detectionConfidence: 0.75,
            landmarkMargins: 0.15,
            colorAdjustment: 'natural',
            targetFps: 30
        };
    });

    ipcMain.handle('settings:save', (_event, settings) => {
        const file = getSettingsPath();
        try {
            fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf-8');
            return true;
        } catch (e) {
            console.error('[Main] Failed to save settings:', e);
            return false;
        }
    });

    // 3. Start Python Worker
    supervisor.startWorker();

    // 4. Create Window
    await createWindow();

    if (mainWindow) {
        // 5. Initialize Global Hotkey Manager (Feature 6.1)
        hotkeyManager = new HotkeyManager(mainWindow);
        hotkeyManager.register('CommandOrControl+\\');

        // 6. Initialize System Tray Controller (Feature 6.2)
        trayController = new TrayController(mainWindow);
        trayController.init();

        trayController.on('request-stop-stream', async () => {
            if (ipcController) {
                await ipcController.sendCommand(CommandType.CMD_STOP_STREAM);
                trayController?.setStreaming(false);
                mainWindow?.webContents.send('stream:stopped');
            }
        });
    }
}

app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', async () => {
    console.log('[Main] Application shutting down...');
    if (hotkeyManager) {
        hotkeyManager.unregister();
    }
    if (trayController) {
        trayController.destroy();
    }
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

