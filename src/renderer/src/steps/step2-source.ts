/**
 * Step 2: Video Source & Physical Webcam Enumerator
 * Auto-enumerates Windows Media Foundation cameras and provides local video file fallback.
 */

import { WizardStateMachine } from '../wizard-state';

export class Step2Source {
    private container: HTMLElement | null = null;
    private availableCameras: MediaDeviceInfo[] = [];

    constructor(
        private state: WizardStateMachine,
        private onNext: () => void,
        private onBack: () => void
    ) {}

    public async render(targetElement: HTMLElement) {
        this.container = targetElement;
        const source = this.state.videoSource;

        await this.refreshCameras();

        targetElement.innerHTML = `
            <div class="step-card fade-in">
                <div class="step-header">
                    <div class="step-badge">STEP 2 OF 4</div>
                    <h2 class="step-title">Select Ingress Video Source</h2>
                    <p class="step-desc">Choose a physical camera or select an offline video file for offline processing and testing.</p>
                </div>

                <!-- Source Type Selector Tabs -->
                <div class="source-type-pills">
                    <button class="pill-tab ${source.sourceType === 'camera' ? 'active' : ''}" id="tab-source-camera">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M23 7l-7 5 7 5V7z"></path>
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                        </svg>
                        Physical Webcam
                    </button>
                    <button class="pill-tab ${source.sourceType === 'file' ? 'active' : ''}" id="tab-source-file">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="23 7 16 12 23 17 23 7"></polygon>
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                        </svg>
                        Local Video File (MP4/MKV)
                    </button>
                </div>

                <!-- Camera Selection View -->
                ${source.sourceType === 'camera' ? `
                    <div class="source-content-section" id="camera-section">
                        <div class="form-group">
                            <label class="form-label" for="camera-select">Detected Video Devices (Windows Media Foundation):</label>
                            <div class="select-wrapper">
                                <select class="custom-select" id="camera-select">
                                    ${this.availableCameras.length > 0 ? this.availableCameras.map(cam => `
                                        <option value="${cam.deviceId}" ${source.deviceId === cam.deviceId ? 'selected' : ''}>
                                            ${cam.label || `Camera ${cam.deviceId.substring(0, 8)}`}
                                        </option>
                                    `).join('') : `
                                        <option value="" disabled selected>No cameras detected. Check USB connection or select Video File.</option>
                                    `}
                                </select>
                                <button class="btn btn-secondary btn-sm" id="btn-refresh-cameras" title="Refresh Camera Devices">
                                    &#x21bb; Refresh
                                </button>
                            </div>
                        </div>

                        <div class="camera-preview-mini">
                            <video id="mini-webcam-preview" autoplay playsinline muted class="mini-video-feed"></video>
                            <div class="stream-stats-bar">
                                <span class="badge badge-teal" id="cam-resolution">1920x1080</span>
                                <span class="badge badge-purple" id="cam-fps">30.00 FPS</span>
                                <span class="badge badge-green">WMF DirectShow/MF</span>
                            </div>
                        </div>
                    </div>
                ` : `
                    <!-- Video File Selection View -->
                    <div class="source-content-section" id="file-section">
                        <div class="file-picker-box">
                            <div class="file-display">
                                <span class="file-chosen-title">${source.fileName ? source.fileName : 'No video file chosen'}</span>
                                <span class="file-chosen-path">${source.filePath ? source.filePath : 'Click browse to select an MP4, MKV, or AVI video file'}</span>
                            </div>
                            <button class="btn btn-secondary" id="btn-browse-video">Browse File...</button>
                        </div>

                        ${source.filePath ? `
                            <div class="file-meta-grid">
                                <div class="meta-item">
                                    <span class="meta-label">Format:</span>
                                    <span class="meta-val">MP4/H.264</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Resolution:</span>
                                    <span class="meta-val">${source.resolution}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Frame Rate:</span>
                                    <span class="meta-val">${source.fps} FPS</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `}

                <!-- Step Footer Navigation -->
                <div class="step-footer">
                    <button class="btn btn-secondary" id="btn-step2-back">&larr; Back</button>
                    <button class="btn btn-primary" id="btn-step2-next" ${!this.state.canProceedStep2() ? 'disabled' : ''}>
                        Next: Hardware Pre-Flight &rarr;
                    </button>
                </div>
            </div>
        `;

        this.bindEvents();
        if (source.sourceType === 'camera' && source.deviceId) {
            this.startMiniPreview(source.deviceId);
        }
    }

    private async refreshCameras() {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                this.availableCameras = devices.filter(d => d.kind === 'videoinput');
                if (this.availableCameras.length > 0 && !this.state.videoSource.deviceId) {
                    this.state.setVideoSource({
                        deviceId: this.availableCameras[0].deviceId,
                        deviceLabel: this.availableCameras[0].label || 'Default Camera'
                    });
                }
            }
        } catch (err) {
            console.error('[Step2Source] Error enumerating devices:', err);
        }
    }

    private bindEvents() {
        if (!this.container) return;

        const tabCam = this.container.querySelector('#tab-source-camera');
        const tabFile = this.container.querySelector('#tab-source-file');
        const camSelect = this.container.querySelector('#camera-select') as HTMLSelectElement;
        const btnRefresh = this.container.querySelector('#btn-refresh-cameras');
        const btnBrowse = this.container.querySelector('#btn-browse-video');
        const btnBack = this.container.querySelector('#btn-step2-back');
        const btnNext = this.container.querySelector('#btn-step2-next');

        if (tabCam) {
            tabCam.addEventListener('click', () => {
                this.state.setVideoSource({ sourceType: 'camera' });
                this.render(this.container!);
            });
        }

        if (tabFile) {
            tabFile.addEventListener('click', () => {
                this.state.setVideoSource({ sourceType: 'file' });
                this.render(this.container!);
            });
        }

        if (camSelect) {
            camSelect.addEventListener('change', () => {
                const deviceId = camSelect.value;
                const cam = this.availableCameras.find(c => c.deviceId === deviceId);
                this.state.setVideoSource({
                    deviceId,
                    deviceLabel: cam?.label || 'Selected Camera'
                });
                this.startMiniPreview(deviceId);
                this.updateNextButton();
            });
        }

        if (btnRefresh) {
            btnRefresh.addEventListener('click', async () => {
                await this.refreshCameras();
                this.render(this.container!);
            });
        }

        if (btnBrowse) {
            btnBrowse.addEventListener('click', async () => {
                if ((window as any).nextHykeAPI?.openVideoDialog) {
                    const res = await (window as any).nextHykeAPI.openVideoDialog();
                    if (res && !res.canceled && res.filePath) {
                        this.state.setVideoSource({
                            filePath: res.filePath,
                            fileName: res.fileName || 'video.mp4',
                            resolution: '1920x1080',
                            fps: 30
                        });
                        this.render(this.container!);
                    }
                }
            });
        }

        if (btnBack) {
            btnBack.addEventListener('click', () => this.onBack());
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                if (this.state.canProceedStep2()) {
                    this.onNext();
                }
            });
        }
    }

    private async startMiniPreview(deviceId: string) {
        const videoEl = this.container?.querySelector('#mini-webcam-preview') as HTMLVideoElement;
        if (!videoEl) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: deviceId } }
            });
            videoEl.srcObject = stream;
        } catch (e) {
            console.log('[Step2Source] Mini preview camera busy or permission denied, using mock indicator');
        }
    }

    private updateNextButton() {
        const btnNext = this.container?.querySelector('#btn-step2-next') as HTMLButtonElement;
        if (btnNext) {
            btnNext.disabled = !this.state.canProceedStep2();
        }
    }
}
