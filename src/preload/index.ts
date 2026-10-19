import { contextBridge, ipcRenderer } from 'electron';

export interface PreflightStatus {
    systemRamGB: number;
    totalRamGB: number;
    ramStatus: 'pass' | 'warn' | 'fail';
    ramMessage: string;
    vramReady: boolean;
    vramStatus: 'pass' | 'warn' | 'fail';
    vramMessage: string;
    gpuName: string;
    cpuThreads: number;
    isReady: boolean;
}

export interface NextHykeAPI {
    pingWorker: () => Promise<{ status: string; timestamp_ms: number }>;
    getTelemetry: () => Promise<any>;
    startStream: (config: any) => Promise<any>;
    stopStream: () => Promise<any>;
    loadModels: () => Promise<any>;
    onWorkerStatus: (callback: (status: string) => void) => void;
    onTelemetryUpdate: (callback: (data: any) => void) => void;
    getAppVersion: () => Promise<string>;
    openImageDialog: () => Promise<{ canceled: boolean; filePath?: string; fileData?: string; fileName?: string; sizeBytes?: number } | null>;
    openVideoDialog: () => Promise<{ canceled: boolean; filePath?: string; fileName?: string; sizeBytes?: number } | null>;
    getPreflightStatus: () => Promise<PreflightStatus>;
    loadSettings: () => Promise<any>;
    saveSettings: (settings: any) => Promise<boolean>;
}

const api: NextHykeAPI = {
    pingWorker: () => ipcRenderer.invoke('worker:ping'),
    getTelemetry: () => ipcRenderer.invoke('worker:telemetry'),
    startStream: (config) => ipcRenderer.invoke('stream:start', config),
    stopStream: () => ipcRenderer.invoke('stream:stop'),
    loadModels: () => ipcRenderer.invoke('models:load'),
    onWorkerStatus: (callback) => {
        ipcRenderer.on('worker:status', (_event, status) => callback(status));
    },
    onTelemetryUpdate: (callback) => {
        ipcRenderer.on('worker:telemetry', (_event, data) => callback(data));
    },
    getAppVersion: () => ipcRenderer.invoke('app:version'),
    openImageDialog: () => ipcRenderer.invoke('dialog:open-image'),
    openVideoDialog: () => ipcRenderer.invoke('dialog:open-video'),
    getPreflightStatus: () => ipcRenderer.invoke('system:preflight'),
    loadSettings: () => ipcRenderer.invoke('settings:load'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings)
};

// Expose safe context bridge
contextBridge.exposeInMainWorld('nextHykeAPI', api);
