import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';

export class TrayController extends EventEmitter {
    private tray: Tray | null = null;
    private mainWindow: BrowserWindow | null = null;
    private _isStreaming: boolean = false;
    private idleIconPath: string;
    private activeIconPath: string;
    private isQuitting: boolean = false;

    constructor(mainWindow: BrowserWindow) {
        super();
        this.mainWindow = mainWindow;
        const ext = process.platform === 'win32' ? '.ico' : '.png';
        const candidateIdle = path.resolve(process.cwd(), `assets/icons/tray-idle${ext}`);
        this.idleIconPath = fs.existsSync(candidateIdle) ? candidateIdle : path.resolve(process.cwd(), 'assets/icons/tray-idle.png');

        const candidateActive = path.resolve(process.cwd(), `assets/icons/tray-active${ext}`);
        this.activeIconPath = fs.existsSync(candidateActive) ? candidateActive : path.resolve(process.cwd(), 'assets/icons/tray-active.png');
    }

    public init(): boolean {
        if (this.tray) {
            return true;
        }

        try {
            if (typeof (Tray as any).isSupported === 'function' && !(Tray as any).isSupported()) {
                console.log('[TrayController] System tray is not supported in this environment.');
                return false;
            }

            const icon = nativeImage.createFromPath(this.idleIconPath);
            this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
            this.tray.setToolTip('NextHyke: Ready (Idle)');


            this.updateContextMenu();

            // Click toggles window visibility
            this.tray.on('click', () => {
                this.toggleWindow();
            });

            // Prevent window close from exiting app; hide to tray instead
            if (this.mainWindow) {
                this.mainWindow.on('close', (event) => {
                    if (!this.isQuitting) {
                        event.preventDefault();
                        this.mainWindow?.hide();
                    }
                });
            }

            app.on('before-quit', () => {
                this.isQuitting = true;
            });

            console.log('[TrayController] System tray initialized with dynamic status indicators.');
            return true;
        } catch (err) {
            console.error('[TrayController] Failed to initialize system tray:', err);
            return false;
        }
    }

    public setStreaming(streaming: boolean): void {
        this._isStreaming = streaming;

        if (this.tray) {
            const iconPath = streaming ? this.activeIconPath : this.idleIconPath;
            const icon = nativeImage.createFromPath(iconPath);
            if (!icon.isEmpty()) {
                this.tray.setImage(icon);
            }

            const tooltip = streaming
                ? 'NextHyke: Streaming (Active - 30 FPS)'
                : 'NextHyke: Ready (Idle)';
            this.tray.setToolTip(tooltip);

            this.updateContextMenu();
        }

        this.emit('streaming-changed', streaming);
    }


    public getIsStreaming(): boolean {
        return this._isStreaming;
    }

    private toggleWindow(): void {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

        if (this.mainWindow.isVisible()) {
            this.mainWindow.hide();
        } else {
            this.mainWindow.show();
            this.mainWindow.focus();
        }
    }

    public updateContextMenu(): void {
        if (!this.tray) return;

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show NextHyke',
                click: () => {
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.show();
                        this.mainWindow.focus();
                    }
                }
            },
            {
                label: 'Hide to Tray (Ctrl+\\)',
                click: () => {
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.hide();
                    }
                }
            },
            { type: 'separator' },
            {
                label: this._isStreaming
                    ? 'Status: Streaming Active (30 FPS)'
                    : 'Status: Ready (Idle)',
                enabled: false
            },
            {
                label: 'Stop Virtual Camera',
                enabled: this._isStreaming,
                click: () => {
                    this.emit('request-stop-stream');
                }
            },
            { type: 'separator' },
            {
                label: 'Quit NextHyke',
                click: () => {
                    this.isQuitting = true;
                    this.destroy();
                    app.quit();
                }
            }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    public destroy(): void {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
            console.log('[TrayController] System tray destroyed.');
        }
    }
}
