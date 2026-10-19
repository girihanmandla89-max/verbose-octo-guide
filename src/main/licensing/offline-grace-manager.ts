/**
 * NextHyke Feature 7.3: Monotonic 72-Hour Offline Grace Period Enforcer
 * Permits 72 hours (259,200s) of continuous offline operation validated against a signed, monotonic local state.
 * Detects clock rollback tampering and enforces online license verification upon grace expiration.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface GraceState {
    lastOnlineSync: number; // Unix timestamp seconds
    lastMonotonicTimestamp: number; // Monotonically increasing Unix timestamp seconds
    totalOfflineElapsedSeconds: number;
    graceLimitSeconds: number; // Default: 259200 (72 hours)
    tampered: boolean;
    tamperReason: string | null;
    signature: string;
}

export interface GraceStatus {
    allowed: boolean;
    isOffline: boolean;
    remainingGraceSeconds: number;
    remainingGraceHours: number;
    tampered: boolean;
    error: string | null;
}

export class OfflineGraceManager {
    public static readonly DEFAULT_GRACE_LIMIT_SECONDS = 72 * 3600; // 259,200 seconds (72 hours)
    private static readonly HMAC_KEY = 'NEXTHYKE_LOCAL_GRACE_INTEGRITY_SALT_2026';

    private stateFilePath: string;
    private state: GraceState;

    constructor(customStorageDir?: string) {
        const storageDir = customStorageDir || process.cwd();
        this.stateFilePath = path.join(storageDir, 'nexthyke_grace_state.json');
        this.state = this.loadOrCreateState();
    }

    private loadOrCreateState(): GraceState {
        const nowSec = Math.floor(Date.now() / 1000);

        if (fs.existsSync(this.stateFilePath)) {
            try {
                const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
                const parsed: GraceState = JSON.parse(raw);

                // Verify HMAC integrity
                const computedSig = this.computeStateHmac(parsed);
                if (computedSig !== parsed.signature) {
                    console.warn('[OfflineGraceManager] State file signature mismatch! Potential tampering detected.');
                    parsed.tampered = true;
                    parsed.tamperReason = 'Local grace state file was modified externally or corrupted.';
                    return parsed;
                }

                return parsed;
            } catch (err) {
                console.error('[OfflineGraceManager] Error reading grace state file:', err);
            }
        }

        // Initialize fresh state
        const freshState: GraceState = {
            lastOnlineSync: nowSec,
            lastMonotonicTimestamp: nowSec,
            totalOfflineElapsedSeconds: 0,
            graceLimitSeconds: OfflineGraceManager.DEFAULT_GRACE_LIMIT_SECONDS,
            tampered: false,
            tamperReason: null,
            signature: ''
        };
        freshState.signature = this.computeStateHmac(freshState);
        this.saveState(freshState);
        return freshState;
    }

    private computeStateHmac(state: Omit<GraceState, 'signature'> & { signature?: string }): string {
        const payload = `${state.lastOnlineSync}:${state.lastMonotonicTimestamp}:${state.totalOfflineElapsedSeconds}:${state.graceLimitSeconds}:${state.tampered}:${state.tamperReason || 'none'}`;
        return crypto
            .createHmac('sha256', OfflineGraceManager.HMAC_KEY)
            .update(payload)
            .digest('hex');
    }

    private saveState(stateToSave: GraceState): void {
        stateToSave.signature = this.computeStateHmac(stateToSave);
        try {
            const dir = path.dirname(this.stateFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.stateFilePath, JSON.stringify(stateToSave, null, 2), 'utf-8');
        } catch (err) {
            console.error('[OfflineGraceManager] Failed to persist grace state:', err);
        }
    }

    /**
     * Checks whether offline streaming is currently authorized.
     * @param simulatedNowSec Optional override for testing clock rollback and offline elapse.
     */
    public checkGraceStatus(simulatedNowSec?: number): GraceStatus {
        const nowSec = simulatedNowSec !== undefined ? simulatedNowSec : Math.floor(Date.now() / 1000);

        // Check 1: Monotonicity & Clock Rollback Detection
        // If current clock is earlier than last recorded monotonic timestamp (with 60s tolerance for NTP drift)
        if (nowSec < this.state.lastMonotonicTimestamp - 60) {
            const setbackHours = Math.round((this.state.lastMonotonicTimestamp - nowSec) / 3600);
            this.state.tampered = true;
            this.state.tamperReason = `Clock rollback detected: system time was set back ${setbackHours} hour(s) into the past.`;
            this.saveState(this.state);

            return {
                allowed: false,
                isOffline: true,
                remainingGraceSeconds: 0,
                remainingGraceHours: 0,
                tampered: true,
                error: 'Security Alert: System clock rollback detected. Please restore correct system time and verify your license online.'
            };
        }

        // Check 2: Tampered state from file corruption / editing
        if (this.state.tampered) {
            return {
                allowed: false,
                isOffline: true,
                remainingGraceSeconds: 0,
                remainingGraceHours: 0,
                tampered: true,
                error: `License authorization revoked: ${this.state.tamperReason || 'Local state integrity compromised.'}`
            };
        }

        // Check 3: Elapsed offline duration
        const elapsedSinceSync = Math.max(0, nowSec - this.state.lastOnlineSync);
        const remainingSeconds = Math.max(0, this.state.graceLimitSeconds - elapsedSinceSync);
        const remainingHours = Math.round((remainingSeconds / 3600) * 10) / 10;

        if (remainingSeconds <= 0) {
            return {
                allowed: false,
                isOffline: true,
                remainingGraceSeconds: 0,
                remainingGraceHours: 0,
                tampered: false,
                error: '72-hour offline grace period has expired. Please connect to the internet to refresh your NextHyke license.'
            };
        }

        // Advance monotonic timestamp
        if (nowSec > this.state.lastMonotonicTimestamp) {
            this.state.lastMonotonicTimestamp = nowSec;
            this.state.totalOfflineElapsedSeconds = elapsedSinceSync;
            this.saveState(this.state);
        }

        return {
            allowed: true,
            isOffline: elapsedSinceSync > 60, // Consider offline if last sync was > 1 min ago
            remainingGraceSeconds: remainingSeconds,
            remainingGraceHours: remainingHours,
            tampered: false,
            error: null
        };
    }

    /**
     * Refreshes the 72-hour grace window when an online license verification succeeds.
     */
    public refreshOnlineSync(simulatedNowSec?: number): void {
        const nowSec = simulatedNowSec !== undefined ? simulatedNowSec : Math.floor(Date.now() / 1000);
        this.state.lastOnlineSync = nowSec;
        this.state.lastMonotonicTimestamp = nowSec; // Reset to authenticated online server timestamp
        this.state.totalOfflineElapsedSeconds = 0;
        this.state.tampered = false;
        this.state.tamperReason = null;
        this.saveState(this.state);
        console.log('[OfflineGraceManager] 72-hour offline grace period refreshed successfully.');
    }


    public getState(): GraceState {
        return { ...this.state };
    }

    public cleanup(): void {
        if (fs.existsSync(this.stateFilePath)) {
            try {
                fs.unlinkSync(this.stateFilePath);
            } catch (err) {
                // Ignored
            }
        }
    }
}
