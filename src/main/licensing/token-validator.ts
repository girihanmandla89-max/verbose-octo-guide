/**
 * NextHyke Feature 7.2: Ed25519 JWT Cryptographic Token Validator
 * Validates server-issued licensing tokens using an embedded Ed25519 public key.
 * STRICT SECURITY DIRECTIVE: ZERO private keys or secrets are stored in the client codebase.
 */

import * as crypto from 'crypto';

export interface LicensePayload {
    licenseId: string;
    machineHash: string;
    tier: 'standard' | 'pro' | 'enterprise';
    issuedAt: number; // Unix timestamp seconds
    expiresAt: number; // Unix timestamp seconds
}

export interface LicenseValidationResult {
    valid: boolean;
    error: string | null;
    payload?: LicensePayload;
    daysRemaining?: number;
}

export class TokenValidator {
    /**
     * Embedded NextHyke Ed25519 Public Verification Key (SPKI format in PEM encoding).
     * This public key is safe for client distribution and contains zero private secrets.
     */
    public static readonly NEXTHYKE_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA9rC5FjL21W/xVlO0/c2Yw1f0oV6bC4uV5a4N5B6X8Y0=
-----END PUBLIC KEY-----`;

    /**
     * Validates a license token against the embedded Ed25519 public key and current machine hash.
     * @param token Compact JWT string format: "header.payload.signature"
     * @param currentMachineHash Machine fingerprint hash from HardwareFingerprinter
     * @param publicKeyPem Optional custom public key (for testing key rotation / unauthorized keys)
     */
    public static validateToken(
        token: string,
        currentMachineHash: string,
        publicKeyPem: string = this.NEXTHYKE_ED25519_PUBLIC_KEY
    ): LicenseValidationResult {
        if (!token || typeof token !== 'string') {
            return {
                valid: false,
                error: 'Please enter a valid license key.'
            };
        }

        const parts = token.trim().split('.');
        if (parts.length !== 3) {
            return {
                valid: false,
                error: 'Invalid license format. Expected standard 3-segment signed token.'
            };
        }

        const [rawHeader, rawPayload, rawSignature] = parts;

        // 1. Decode and verify header
        let header: any;
        try {
            const headerJson = Buffer.from(rawHeader, 'base64url').toString('utf-8');
            header = JSON.parse(headerJson);
        } catch (err) {
            return {
                valid: false,
                error: 'License token header is corrupt or unreadable.'
            };
        }

        if (header.alg !== 'EdDSA' && header.alg !== 'Ed25519') {
            return {
                valid: false,
                error: `Unsupported cryptographic algorithm: ${header.alg}. NextHyke requires Ed25519 signatures.`
            };
        }

        // 2. Cryptographic Ed25519 Signature Verification
        const signedData = Buffer.from(`${rawHeader}.${rawPayload}`, 'utf-8');
        const signatureBytes = Buffer.from(rawSignature, 'base64url');

        let isSignatureValid = false;
        try {
            isSignatureValid = crypto.verify(
                null,
                signedData,
                publicKeyPem,
                signatureBytes
            );
        } catch (err) {
            return {
                valid: false,
                error: 'Cryptographic signature verification failed: invalid key structure.'
            };
        }

        if (!isSignatureValid) {
            return {
                valid: false,
                error: 'License signature verification failed. Token has been modified, tampered with, or signed by an unauthorized authority.'
            };
        }

        // 3. Decode and validate payload
        let payload: LicensePayload;
        try {
            const payloadJson = Buffer.from(rawPayload, 'base64url').toString('utf-8');
            payload = JSON.parse(payloadJson);
        } catch (err) {
            return {
                valid: false,
                error: 'License payload contains malformed JSON data.'
            };
        }

        if (!payload.licenseId || !payload.machineHash || !payload.expiresAt) {
            return {
                valid: false,
                error: 'Incomplete license payload: missing required authorization fields.'
            };
        }

        // 4. Hardware Machine Binding Check
        if (payload.machineHash !== currentMachineHash) {
            return {
                valid: false,
                error: 'License is bound to a different machine. Hardware fingerprint mismatch.'
            };
        }

        // 5. Expiration Date Check
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec > payload.expiresAt) {
            const expiredDaysAgo = Math.max(1, Math.floor((nowSec - payload.expiresAt) / 86400));
            return {
                valid: false,
                error: `License expired ${expiredDaysAgo} day(s) ago. Please renew your NextHyke subscription.`,
                payload
            };
        }

        const daysRemaining = Math.max(0, Math.floor((payload.expiresAt - nowSec) / 86400));

        return {
            valid: true,
            error: null,
            payload,
            daysRemaining
        };
    }

    /**
     * Helper for test suite: generates a signed token using a transient test private key.
     * Never deployed in production runtime.
     */
    public static createTestSignedToken(
        payload: LicensePayload,
        privateKeyPem: string
    ): string {
        const header = { alg: 'EdDSA', typ: 'JWT' };
        const rawHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const rawPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signedData = Buffer.from(`${rawHeader}.${rawPayload}`, 'utf-8');
        const signature = crypto.sign(null, signedData, privateKeyPem);
        const rawSig = signature.toString('base64url');
        return `${rawHeader}.${rawPayload}.${rawSig}`;
    }
}
