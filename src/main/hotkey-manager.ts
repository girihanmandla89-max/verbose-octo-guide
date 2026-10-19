import { globalShortcut, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';

export interface HotkeyToggleResult {
    visible: boolean;
    latencyMs: number;
}

export class HotkeyManager extends EventEmitter {
    private currentShortcut: string = 'CommandOrControl+\\';
    private registered: boolean = false;
    private targetWindow: BrowserWindow | null = null;
    private lastToggleLatencyMs: number = 0;

    constructor(targetWindow?: BrowserWindow) {
        super();
        if (targetWindow) {
            this.targetWindow = targetWindow;
        }
    }

    public setTargetWindow(window: BrowserWindow): void {
        this.targetWindow = window;
    }

    public register(shortcut?: string, customCallback?: () => void): boolean {
        if (shortcut) {
            this.currentShortcut = shortcut;
        }

        // Unregister existing if any
        this.unregister();

        const success = globalShortcut.register(this.currentShortcut, () => {
            const start = performance.now();
            let visible = false;

            if (customCallback) {
                customCallback();
            } else if (this.targetWindow && !this.targetWindow.isDestroyed()) {
                const res = this.toggleWindow(this.targetWindow);
                visible = res.visible;
            }

            const end = performance.now();
            this.lastToggleLatencyMs = end - start;
            this.emit('toggled', { visible, latencyMs: this.lastToggleLatencyMs });
        });

        this.registered = success;
        if (success) {
            console.log(`[HotkeyManager] Registered global window toggle shortcut: ${this.currentShortcut}`);
        } else {
            console.warn(`[HotkeyManager] Failed to register global shortcut: ${this.currentShortcut}`);
        }

        return success;
    }

    public toggleWindow(window: BrowserWindow): HotkeyToggleResult {
        const start = performance.now();
        let visible: boolean;

        if (window.isDestroyed()) {
            return { visible: false, latencyMs: 0 };
        }

        if (window.isVisible() && window.isFocused()) {
            window.hide();
            visible = false;
        } else {
            window.show();
            window.focus();
            visible = true;
        }

        const end = performance.now();
        const latencyMs = end - start;
        this.lastToggleLatencyMs = latencyMs;
        return { visible, latencyMs };
    }

    public unregister(): void {
        if (this.registered) {
            try {
                globalShortcut.unregister(this.currentShortcut);
            } catch (err) {
                console.warn('[HotkeyManager] Error unregistering hotkey:', err);
            }
            this.registered = false;
            console.log(`[HotkeyManager] Unregistered global shortcut: ${this.currentShortcut}`);
        }
    }

    public isRegistered(): boolean {
        return this.registered;
    }

    public getShortcut(): string {
        return this.currentShortcut;
    }

    public getLastLatency(): number {
        return this.lastToggleLatencyMs;
    }
}
