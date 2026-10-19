/**
 * NextHyke Master License Controller
 * Integrates Hardware Fingerprinting, Ed25519 Token Validation, and Monotonic Offline Grace Enforcement.
 */

import * as fs from 'fs';
import * as path from 'path';
import { HardwareFingerprinter } from './hardware-fingerprint';
import { TokenValidator, LicenseValidationResult } from './token-validator';
import { OfflineGraceManager, GraceStatus } from './offline-grace-manager';

export interface LicenseStatusInfo {
    active: boolean;
    tier: string;
    licenseId: string | null;
    daysRemaining: number;
    machineHash: string;
    graceStatus: GraceStatus;
    error: string | null;
}

export class LicenseController {
    private storageDir: string;
    private licenseFilePath: string;
    private graceManager: OfflineGraceManager;
    private currentLicenseToken: string | null = null;
    private cachedValidation: LicenseValidationResult | null = null;

    constructor(customStorageDir?: string) {
        this.storageDir = customStorageDir || process.cwd();
        this.licenseFilePath = path.join(this.storageDir, 'nexthyke_license.json');
        this.graceManager = new OfflineGraceManager(this.storageDir);
        this.loadStoredLicense();
    }

    private loadStoredLicense(): void {
        if (fs.existsSync(this.licenseFilePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.licenseFilePath, 'utf-8'));
                if (data && data.token) {
                    this.currentLicenseToken = data.token;
                    this.validateCurrentToken();
                }
            } catch (err) {
                console.warn('[LicenseController] Error reading stored license:', err);
            }
        }
    }

    private validateCurrentToken(): LicenseValidationResult {
        if (!this.currentLicenseToken) {
            this.cachedValidation = {
                valid: false,
                error: 'No active license found. Please activate NextHyke.'
            };
            return this.cachedValidation;
        }

        const fp = HardwareFingerprinter.getFingerprint();
        const res = TokenValidator.validateToken(this.currentLicenseToken, fp.machineHash);
        this.cachedValidation = res;
        return res;
    }

    public activateLicense(token: string): LicenseValidationResult {
        const fp = HardwareFingerprinter.getFingerprint();
        const res = TokenValidator.validateToken(token, fp.machineHash);

        if (res.valid) {
            this.currentLicenseToken = token;
            this.cachedValidation = res;

            try {
                fs.writeFileSync(
                    this.licenseFilePath,
                    JSON.stringify({ token, activatedAt: Math.floor(Date.now() / 1000) }, null, 2),
                    'utf-8'
                );
                // Refresh online grace window
                this.graceManager.refreshOnlineSync();
                console.log('[LicenseController] License activated successfully.');
            } catch (err) {
                console.error('[LicenseController] Error saving license token:', err);
            }
        }

        return res;
    }

    public getStatus(): LicenseStatusInfo {
        const fp = HardwareFingerprinter.getFingerprint();
        const grace = this.graceManager.checkGraceStatus();

        if (!this.cachedValidation) {
            this.validateCurrentToken();
        }

        const val = this.cachedValidation!;
        const isOverallActive = val.valid && grace.allowed;

        let effectiveError: string | null = null;
        if (!val.valid) {
            effectiveError = val.error;
        } else if (!grace.allowed) {
            effectiveError = grace.error;
        }

        return {
            active: isOverallActive,
            tier: val.payload?.tier || 'none',
            licenseId: val.payload?.licenseId || null,
            daysRemaining: val.daysRemaining || 0,
            machineHash: fp.machineHash,
            graceStatus: grace,
            error: effectiveError
        };
    }

    public getGraceManager(): OfflineGraceManager {
        return this.graceManager;
    }

    public clearStoredLicense(): void {
        this.currentLicenseToken = null;
        this.cachedValidation = null;
        if (fs.existsSync(this.licenseFilePath)) {
            try {
                fs.unlinkSync(this.licenseFilePath);
            } catch (err) {
                // Ignored
            }
        }
    }
}
