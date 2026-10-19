/**
 * Step 4: Controls, Live Comparison Canvas & Advanced Drawer
 * Live side-by-side comparison canvas (Ingress vs. Processed) and collapsible advanced drawer.
 */

import { WizardStateMachine, AdvancedSettings } from '../wizard-state';

export class Step4Controls {
    private container: HTMLElement | null = null;
    private animFrameId: number | null = null;
    private isStreaming: boolean = false;

    constructor(
        private state: WizardStateMachine,
        private onBack: () => void
    ) {}

    public render(targetElement: HTMLElement) {
        this.container = targetElement;
        const photo = this.state.referencePhoto;
        const source = this.state.videoSource;
        const settings = this.state.advancedSettings;

        targetElement.innerHTML = `
            <div class="step-card dashboard-card fade-in">
                <!-- Top Control Bar -->
                <div class="dashboard-header">
                    <div class="stream-info">
                        <span class="stream-badge">LIVE DASHBOARD</span>
                        <h2 class="dashboard-title">NextHyke AI Video Engine & Virtual Camera</h2>
                        <span class="source-tag">${source.sourceType === 'camera' ? (source.deviceLabel || 'Camera') : (source.fileName || 'Video')}</span>
                    </div>

                    <div class="header-actions">
                        <button class="btn btn-secondary btn-sm" id="btn-toggle-drawer">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                            ${settings.drawerOpen ? 'Hide Settings' : 'Advanced Settings'}
                        </button>
                        <button class="btn ${this.isStreaming ? 'btn-danger' : 'btn-success'}" id="btn-toggle-stream">
                            ${this.isStreaming ? '&#9632; Stop Stream' : '&#9658; Start Camera Broadcast'}
                        </button>
                    </div>
                </div>

                <!-- Side-by-Side Live Viewport -->
                <div class="viewport-canvas-container">
                    <!-- Left Canvas: Camera Ingress -->
                    <div class="canvas-card">
                        <div class="canvas-header">
                            <span class="canvas-title">Camera Ingress (Source)</span>
                            <span class="live-tag">LIVE</span>
                        </div>
                        <div class="canvas-frame">
                            <canvas id="canvas-ingress" width="640" height="360"></canvas>
                        </div>
                    </div>

                    <!-- Right Canvas: NextHyke Egress -->
                    <div class="canvas-card">
                        <div class="canvas-header">
                            <span class="canvas-title">NextHyke Processed Egress</span>
                            <span class="badge badge-purple" id="vcam-badge">Virtual Camera Active</span>
                        </div>
                        <div class="canvas-frame">
                            <canvas id="canvas-egress" width="640" height="360"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Live Stream Status Bar -->
                <div class="telemetry-compact-bar">
                    <div class="metric-pill">
                        <span class="pill-label">Inference Latency:</span>
                        <span class="pill-val" id="telem-latency">12.4 ms</span>
                    </div>
                    <div class="metric-pill">
                        <span class="pill-label">Effective FPS:</span>
                        <span class="pill-val" id="telem-fps">30.00 FPS</span>
                    </div>
                    <div class="metric-pill">
                        <span class="pill-label">VRAM Usage:</span>
                        <span class="pill-val" id="telem-vram">0.42 / 1.40 GB</span>
                    </div>
                    <div class="metric-pill">
                        <span class="pill-label">Virtual Camera Sink:</span>
                        <span class="pill-val highlight">NextHyke Processed Camera</span>
                    </div>
                </div>

                <!-- Collapsible Advanced Settings Drawer -->
                <div class="advanced-drawer ${settings.drawerOpen ? 'open' : ''}" id="advanced-drawer-container">
                    <div class="drawer-header">
                        <span class="drawer-title">Fine-Tuning & Pipeline Adjustments</span>
                        <span class="drawer-sub">Settings persist across application sessions</span>
                    </div>
                    <div class="drawer-controls-grid">
                        <div class="drawer-control">
                            <label for="conf-slider">Detection Confidence: <span id="conf-val">${settings.detectionConfidence}</span></label>
                            <input type="range" id="conf-slider" min="0.5" max="0.95" step="0.05" value="${settings.detectionConfidence}">
                        </div>

                        <div class="drawer-control">
                            <label for="margin-slider">Landmark Alignment Margins: <span id="margin-val">${settings.landmarkMargins}</span></label>
                            <input type="range" id="margin-slider" min="0.05" max="0.30" step="0.05" value="${settings.landmarkMargins}">
                        </div>

                        <div class="drawer-control">
                            <label for="color-select">Color Adjustment Profile:</label>
                            <select id="color-select" class="custom-select">
                                <option value="natural" ${settings.colorAdjustment === 'natural' ? 'selected' : ''}>Natural Color Correction</option>
                                <option value="vibrant" ${settings.colorAdjustment === 'vibrant' ? 'selected' : ''}>Vibrant Enhancement</option>
                                <option value="studio" ${settings.colorAdjustment === 'studio' ? 'selected' : ''}>Studio Lighting Tone</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="step-footer">
                    <button class="btn btn-secondary" id="btn-step4-back">&larr; Reconfigure Inputs</button>
                    <span class="stream-hint">Ready for Microsoft Teams, Zoom, and Google Meet</span>
                </div>
            </div>
        `;

        this.bindEvents();
        this.startCanvasRendering();
    }

    private bindEvents() {
        if (!this.container) return;

        const btnToggleStream = this.container.querySelector('#btn-toggle-stream');
        const btnToggleDrawer = this.container.querySelector('#btn-toggle-drawer');
        const btnBack = this.container.querySelector('#btn-step4-back');
        const confSlider = this.container.querySelector('#conf-slider') as HTMLInputElement;
        const marginSlider = this.container.querySelector('#margin-slider') as HTMLInputElement;
        const colorSelect = this.container.querySelector('#color-select') as HTMLSelectElement;

        if (btnToggleStream) {
            btnToggleStream.addEventListener('click', async () => {
                this.isStreaming = !this.isStreaming;
                if ((window as any).nextHykeAPI) {
                    if (this.isStreaming) {
                        await (window as any).nextHykeAPI.startStream({ source: this.state.videoSource });
                    } else {
                        await (window as any).nextHykeAPI.stopStream();
                    }
                }
                this.render(this.container!);
            });
        }

        if (btnToggleDrawer) {
            btnToggleDrawer.addEventListener('click', () => {
                const isOpen = !this.state.advancedSettings.drawerOpen;
                this.state.updateAdvancedSettings({ drawerOpen: isOpen });
                this.saveSettings();
                const drawer = this.container?.querySelector('#advanced-drawer-container');
                if (drawer) {
                    drawer.classList.toggle('open', isOpen);
                }
                if (btnToggleDrawer) {
                    btnToggleDrawer.innerHTML = isOpen ? 'Hide Settings' : 'Advanced Settings';
                }
            });
        }

        if (confSlider) {
            confSlider.addEventListener('input', () => {
                const val = parseFloat(confSlider.value);
                const valSpan = this.container?.querySelector('#conf-val');
                if (valSpan) valSpan.textContent = val.toString();
                this.state.updateAdvancedSettings({ detectionConfidence: val });
                this.saveSettings();
            });
        }

        if (marginSlider) {
            marginSlider.addEventListener('input', () => {
                const val = parseFloat(marginSlider.value);
                const valSpan = this.container?.querySelector('#margin-val');
                if (valSpan) valSpan.textContent = val.toString();
                this.state.updateAdvancedSettings({ landmarkMargins: val });
                this.saveSettings();
            });
        }

        if (colorSelect) {
            colorSelect.addEventListener('change', () => {
                this.state.updateAdvancedSettings({ colorAdjustment: colorSelect.value });
                this.saveSettings();
            });
        }

        if (btnBack) {
            btnBack.addEventListener('click', () => {
                this.stopCanvasRendering();
                this.onBack();
            });
        }
    }

    private saveSettings() {
        if ((window as any).nextHykeAPI?.saveSettings) {
            (window as any).nextHykeAPI.saveSettings(this.state.advancedSettings);
        }
    }

    private startCanvasRendering() {
        const ingressCanvas = this.container?.querySelector('#canvas-ingress') as HTMLCanvasElement;
        const egressCanvas = this.container?.querySelector('#canvas-egress') as HTMLCanvasElement;
        if (!ingressCanvas || !egressCanvas) return;

        const ctxIn = ingressCanvas.getContext('2d');
        const ctxOut = egressCanvas.getContext('2d');
        if (!ctxIn || !ctxOut) return;

        let frame = 0;
        const renderLoop = () => {
            frame++;

            // Draw Ingress Mock Camera Feed (Clean gradient + facial outline representation)
            ctxIn.fillStyle = '#0f172a';
            ctxIn.fillRect(0, 0, 640, 360);

            // Animated subtle pulse to prove active 60Hz canvas rendering
            const pulse = Math.sin(frame * 0.05) * 5;
            ctxIn.strokeStyle = 'rgba(0, 210, 255, 0.4)';
            ctxIn.lineWidth = 2;
            ctxIn.beginPath();
            ctxIn.arc(320, 180 + pulse, 60, 0, Math.PI * 2);
            ctxIn.stroke();

            ctxIn.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctxIn.font = '12px Outfit, sans-serif';
            ctxIn.fillText('Input Camera Frame (WMF Ingress)', 20, 30);

            // Draw Egress Processed Feed
            ctxOut.fillStyle = '#0d1527';
            ctxOut.fillRect(0, 0, 640, 360);

            ctxOut.strokeStyle = 'rgba(0, 245, 160, 0.6)';
            ctxOut.lineWidth = 2;
            ctxOut.beginPath();
            ctxOut.arc(320, 180 + pulse, 62, 0, Math.PI * 2);
            ctxOut.stroke();

            ctxOut.fillStyle = 'rgba(0, 245, 160, 0.9)';
            ctxOut.font = '12px Outfit, sans-serif';
            ctxOut.fillText('NextHyke Processed Stream (Virtual Camera Sink)', 20, 30);

            this.animFrameId = requestAnimationFrame(renderLoop);
        };

        this.animFrameId = requestAnimationFrame(renderLoop);
    }

    private stopCanvasRendering() {
        if (this.animFrameId !== null) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }
}
