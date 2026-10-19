/**
 * NextHyke Feature 8.1: Privacy-Preserving Opt-In Telemetry Subsystem
 * Strictly enforces user opt-in consent before collecting anonymous performance metrics.
 * ZERO collection of video, frames, audio, biometric data, or facial landmark arrays.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TelemetryPayload {
    session_duration: number;
    gpu_provider: string;
    error_code?: string;
    app_version: string;
}

export type ConsentStatus = 'unset' | 'accepted' | 'declined';

export class TelemetryManager {
    private storageDir: string;
    private configFilePath: string;
    private consentStatus: ConsentStatus = 'unset';
    private appVersion: string = '1.0.0';

    // Strictly forbidden keywords to prevent any privacy leaks
    private static readonly PROHIBITED_KEYS = [
        'frame', 'image', 'video', 'landmark', 'face', 'audio',
        'biometric', 'buffer', 'pixels', 'crop', 'embedding'
    ];

    constructor(customStorageDir?: string) {
        this.storageDir = customStorageDir || process.cwd();
        this.configFilePath = path.join(this.storageDir, 'nexthyke_telemetry_consent.json');
        this.loadConsent();
    }

    private loadConsent(): void {
        if (fs.existsSync(this.configFilePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.configFilePath, 'utf-8'));
                if (data && (data.consent === 'accepted' || data.consent === 'declined')) {
                    this.consentStatus = data.consent;
                }
            } catch (err) {
                console.warn('[TelemetryManager] Failed to read telemetry consent config:', err);
            }
        }
    }

    public getConsentStatus(): ConsentStatus {
        return this.consentStatus;
    }

    public setConsent(accepted: boolean): void {
        this.consentStatus = accepted ? 'accepted' : 'declined';
        try {
            const dir = path.dirname(this.configFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(
                this.configFilePath,
                JSON.stringify({
                    consent: this.consentStatus,
                    timestamp: Math.floor(Date.now() / 1000)
                }, null, 2),
                'utf-8'
            );
            console.log(`[TelemetryManager] Telemetry consent updated: ${this.consentStatus}`);
        } catch (err) {
            console.error('[TelemetryManager] Failed to persist telemetry consent:', err);
        }
    }

    /**
     * Sanitizes and records an anonymous telemetry record.
     * Rejects transmission if consent is declined or if forbidden fields are present.
     */
    public recordSession(
        durationSeconds: number,
        gpuProvider: string,
        errorCode?: string
    ): { sent: boolean; reason: string; payload?: TelemetryPayload } {
        // Enforce opt-in consent gate
        if (this.consentStatus !== 'accepted') {
            return {
                sent: false,
                reason: `Telemetry transmission disabled. Consent status: '${this.consentStatus}'`
            };
        }

        const payload: TelemetryPayload = {
            session_duration: Math.round(durationSeconds),
            gpu_provider: gpuProvider || 'Unknown-GPU',
            error_code: errorCode,
            app_version: this.appVersion
        };

        // Privacy Audit: verify zero prohibited fields exist
        const keys = Object.keys(payload);
        for (const key of keys) {
            const lower = key.toLowerCase();
            for (const prohibited of TelemetryManager.PROHIBITED_KEYS) {
                if (lower.includes(prohibited)) {
                    throw new Error(`CRITICAL PRIVACY BREACH: Prohibited field '${key}' detected in telemetry payload!`);
                }
            }
        }

        console.log(`[TelemetryManager] Anonymous session telemetry recorded: duration=${payload.session_duration}s, gpu=${payload.gpu_provider}`);
        return {
            sent: true,
            reason: 'Telemetry accepted and dispatched.',
            payload
        };
    }

    public cleanup(): void {
        if (fs.existsSync(this.configFilePath)) {
            try {
                fs.unlinkSync(this.configFilePath);
            } catch (err) {
                // Ignored
            }
        }
    }
}
