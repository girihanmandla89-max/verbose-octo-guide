/**
 * NextHyke Wizard State Machine
 * Central reactive state store managing user progression through the 4-step wizard.
 */

export interface ReferencePhotoState {
    filePath: string | null;
    dataUrl: string | null;
    fileName: string | null;
    sizeBytes: number;
    isValid: boolean;
    errorMessage: string | null;
}

export interface VideoSourceState {
    sourceType: 'camera' | 'file';
    deviceId: string | null;
    deviceLabel: string | null;
    filePath: string | null;
    fileName: string | null;
    resolution: string;
    fps: number;
}

export interface AdvancedSettings {
    detectionConfidence: number;
    landmarkMargins: number;
    colorAdjustment: string;
    targetFps: number;
    drawerOpen: boolean;
}

export type ThemeType = 'dark' | 'light' | 'high-contrast';

export class WizardStateMachine {
    private currentStep: number = 1;
    public referencePhoto: ReferencePhotoState = {
        filePath: null,
        dataUrl: null,
        fileName: null,
        sizeBytes: 0,
        isValid: false,
        errorMessage: null
    };
    public rightsConfirmed: boolean = false;

    public videoSource: VideoSourceState = {
        sourceType: 'camera',
        deviceId: null,
        deviceLabel: null,
        filePath: null,
        fileName: null,
        resolution: '1920x1080',
        fps: 30
    };

    public preflightReady: boolean = false;
    public isStreaming: boolean = false;
    public activeTheme: ThemeType = 'dark';

    public advancedSettings: AdvancedSettings = {
        detectionConfidence: 0.75,
        landmarkMargins: 0.15,
        colorAdjustment: 'natural',
        targetFps: 30,
        drawerOpen: false
    };

    private listeners: Array<(state: WizardStateMachine) => void> = [];

    public subscribe(listener: (state: WizardStateMachine) => void) {
        this.listeners.push(listener);
    }

    private notify() {
        for (const listener of this.listeners) {
            listener(this);
        }
    }

    public getStep(): number {
        return this.currentStep;
    }

    public setStep(step: number) {
        if (step < 1 || step > 4) return;
        // Verify gating prerequisites
        if (step >= 2 && !this.canProceedStep1()) return;
        if (step >= 3 && !this.canProceedStep2()) return;
        if (step === 4 && !this.preflightReady) return;

        this.currentStep = step;
        this.notify();
    }

    public canProceedStep1(): boolean {
        return this.referencePhoto.isValid && this.rightsConfirmed;
    }

    public canProceedStep2(): boolean {
        if (this.videoSource.sourceType === 'camera') {
            return this.videoSource.deviceId !== null;
        } else {
            return this.videoSource.filePath !== null;
        }
    }

    public setReferencePhoto(filePath: string, fileName: string, sizeBytes: number, dataUrl: string) {
        const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
        if (sizeBytes > MAX_SIZE) {
            this.referencePhoto = {
                filePath: null,
                dataUrl: null,
                fileName,
                sizeBytes,
                isValid: false,
                errorMessage: 'File exceeds 15 MB limit. Please upload a smaller image.'
            };
        } else {
            this.referencePhoto = {
                filePath,
                dataUrl,
                fileName,
                sizeBytes,
                isValid: true,
                errorMessage: null
            };
        }
        this.notify();
    }

    public setRightsConfirmed(confirmed: boolean) {
        this.rightsConfirmed = confirmed;
        this.notify();
    }

    public setVideoSource(source: Partial<VideoSourceState>) {
        this.videoSource = { ...this.videoSource, ...source };
        this.notify();
    }

    public setPreflightReady(ready: boolean) {
        this.preflightReady = ready;
        this.notify();
    }

    public updateAdvancedSettings(settings: Partial<AdvancedSettings>) {
        this.advancedSettings = { ...this.advancedSettings, ...settings };
        this.notify();
    }

    public setTheme(theme: ThemeType) {
        this.activeTheme = theme;
        this.notify();
    }
}
