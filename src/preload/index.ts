import { contextBridge, ipcRenderer } from 'electron';

export interface NextHykeAPI {
    pingWorker: () => Promise<{ status: string; timestamp_ms: number }>;
    getTelemetry: () => Promise<any>;
    startStream: (config: any) => Promise<any>;
    stopStream: () => Promise<any>;
    loadModels: () => Promise<any>;
    onWorkerStatus: (callback: (status: string) => void) => void;
    onTelemetryUpdate: (callback: (data: any) => void) => void;
    getAppVersion: () => Promise<string>;
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
    getAppVersion: () => ipcRenderer.invoke('app:version')
};

// Expose safe context bridge
contextBridge.exposeInMainWorld('nextHykeAPI', api);
