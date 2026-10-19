/**
 * NextHyke Feature 8.1: Privacy-Preserving First-Run Telemetry Consent Modal
 * Explains anonymous telemetry collection and requires explicit user opt-in consent.
 */

export class TelemetryConsentModal {
    private container: HTMLElement;
    private onResolve: ((accepted: boolean) => void) | null = null;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'telemetry-consent-modal';
        this.container.className = 'modal-backdrop hidden';
        this.container.setAttribute('role', 'dialog');
        this.container.setAttribute('aria-modal', 'true');
        this.container.setAttribute('aria-labelledby', 'telemetry-modal-title');
        this.render();
        document.body.appendChild(this.container);
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <div class="modal-icon-badge">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                    </div>
                    <h2 id="telemetry-modal-title">Privacy & Performance Telemetry</h2>
                </div>
                <div class="modal-body">
                    <p class="privacy-statement">
                        Help improve <strong>NextHyke</strong> by sharing anonymous performance telemetry 
                        (session duration, GPU execution provider, and hardware acceleration status).
                    </p>
                    <div class="privacy-guarantee-box">
                        <div class="guarantee-icon">🛡️</div>
                        <div class="guarantee-text">
                            <strong>Zero Biometric Data Collection:</strong> We <em>never</em> collect, record, 
                            store, or transmit video frames, webcam buffers, audio, or facial landmark arrays. 
                            All AI facial synthesis executes 100% locally on your device.
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="btn-telemetry-decline" class="btn btn-secondary" type="button">
                        Decline
                    </button>
                    <button id="btn-telemetry-accept" class="btn btn-primary" type="button">
                        Accept & Continue
                    </button>
                </div>
            </div>
        `;

        const btnDecline = this.container.querySelector('#btn-telemetry-decline') as HTMLButtonElement;
        const btnAccept = this.container.querySelector('#btn-telemetry-accept') as HTMLButtonElement;

        btnDecline?.addEventListener('click', () => this.handleChoice(false));
        btnAccept?.addEventListener('click', () => this.handleChoice(true));

        this.container.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.handleChoice(false);
            }
        });
    }

    public prompt(): Promise<boolean> {
        return new Promise((resolve) => {
            this.onResolve = resolve;
            this.container.classList.remove('hidden');
            const acceptBtn = this.container.querySelector('#btn-telemetry-accept') as HTMLButtonElement;
            acceptBtn?.focus();
        });
    }

    private handleChoice(accepted: boolean): void {
        this.container.classList.add('hidden');
        if (this.onResolve) {
            this.onResolve(accepted);
            this.onResolve = null;
        }
    }

    public destroy(): void {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
}
