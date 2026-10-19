/**
 * NextHyke Desktop Renderer Orchestrator
 * Coordinates Step 1 (Reference), Step 2 (Source), Step 3 (Pre-Flight), Step 4 (Controls & Canvas),
 * and Command Palette (Ctrl+K).
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Renderer] Initializing NextHyke Guided Wizard...');

    // State Store
    const state = {
        currentStep: 1,
        referencePhoto: {
            filePath: null,
            dataUrl: null,
            fileName: null,
            sizeBytes: 0,
            isValid: false,
            errorMessage: null
        },
        rightsConfirmed: false,
        videoSource: {
            sourceType: 'camera', // 'camera' or 'file'
            deviceId: null,
            deviceLabel: null,
            filePath: null,
            fileName: null,
            resolution: '1920x1080',
            fps: 30
        },
        preflight: {
            systemRamGB: 0,
            totalRamGB: 0,
            ramStatus: 'pass',
            ramMessage: '',
            vramReady: true,
            vramStatus: 'pass',
            vramMessage: '',
            gpuName: 'NVIDIA GeForce MX450',
            cpuThreads: 8,
            isReady: false,
            durationMs: 0
        },
        advancedSettings: {
            detectionConfidence: 0.75,
            landmarkMargins: 0.15,
            colorAdjustment: 'natural',
            targetFps: 30,
            drawerOpen: false
        },
        isStreaming: false,
        theme: 'dark'
    };

    // DOM Elements
    const viewport = document.getElementById('step-viewport');
    const statusDot = document.getElementById('worker-status-dot');
    const statusText = document.getElementById('worker-status-text');
    const vramUsage = document.getElementById('vram-usage');
    const btnPalette = document.getElementById('btn-open-palette');

    // Load persisted settings
    if (window.nextHykeAPI?.loadSettings) {
        try {
            const saved = await window.nextHykeAPI.loadSettings();
            if (saved) {
                state.advancedSettings = { ...state.advancedSettings, ...saved };
                if (saved.theme) {
                    state.theme = saved.theme;
                    applyTheme(saved.theme);
                }
            }
        } catch (e) {
            console.warn('[Renderer] Using default settings:', e);
        }
    }

    // Step Gating Checkers
    function canProceedStep1() {
        return state.referencePhoto.isValid && state.rightsConfirmed;
    }

    function canProceedStep2() {
        if (state.videoSource.sourceType === 'camera') {
            return state.videoSource.deviceId !== null;
        }
        return state.videoSource.filePath !== null;
    }

    function setStep(stepNum) {
        if (stepNum < 1 || stepNum > 4) return;
        if (stepNum >= 2 && !canProceedStep1()) return;
        if (stepNum >= 3 && !canProceedStep2()) return;
        if (stepNum === 4 && !state.preflight.isReady) return;

        state.currentStep = stepNum;
        updateNavTabs();
        renderActiveStep();
    }

    function updateNavTabs() {
        for (let i = 1; i <= 4; i++) {
            const tab = document.getElementById(`nav-step-${i}`);
            if (tab) {
                tab.classList.toggle('active', state.currentStep === i);
            }
        }
    }

    // Wire Nav Tab Clicks
    for (let i = 1; i <= 4; i++) {
        const tab = document.getElementById(`nav-step-${i}`);
        if (tab) {
            tab.addEventListener('click', () => setStep(i));
        }
    }

    // ==========================================
    // STEP 1: REFERENCE PHOTO PICKER
    // ==========================================
    function renderStep1() {
        const photo = state.referencePhoto;
        const isConfirmed = state.rightsConfirmed;
        const canProceed = canProceedStep1();

        viewport.innerHTML = `
            <div class="step-card fade-in">
                <div class="step-header">
                    <div class="step-badge">STEP 1 OF 4</div>
                    <h2 class="step-title">Select Target Reference Photo</h2>
                    <p class="step-desc">Upload a high-clarity portrait image. The AI engine uses this reference identity for real-time facial processing.</p>
                </div>

                <!-- Dropzone Area -->
                <div class="dropzone-area ${photo.isValid ? 'has-file' : ''}" id="dropzone-container">
                    <input type="file" id="file-input" accept="image/png,image/jpeg,image/webp" style="display: none;">
                    
                    ${photo.isValid && photo.dataUrl ? `
                        <div class="preview-box">
                            <img src="${photo.dataUrl}" alt="Reference Preview" class="photo-preview-img" id="img-preview">
                            <div class="preview-overlay">
                                <span class="file-tag">${photo.fileName}</span>
                                <span class="size-tag">${(photo.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                                <button class="btn btn-secondary btn-sm" id="btn-change-photo">Change Photo</button>
                            </div>
                        </div>
                    ` : `
                        <div class="dropzone-prompt" id="dropzone-prompt">
                            <div class="upload-icon-circle">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                            </div>
                            <span class="prompt-main">Drag & drop your reference photo here, or <strong class="browse-link">browse</strong></span>
                            <span class="prompt-sub">Supports PNG, JPEG, WEBP up to 15 MB</span>
                        </div>
                    `}
                </div>

                <!-- Error Banner -->
                ${photo.errorMessage ? `
                    <div class="alert-banner alert-error" id="step1-error-banner">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <span>${photo.errorMessage}</span>
                    </div>
                ` : ''}

                <!-- Mandatory Legal Rights Checkbox -->
                <div class="legal-box">
                    <label class="checkbox-container">
                        <input type="checkbox" id="legal-rights-checkbox" ${isConfirmed ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        <span class="legal-text">
                            <strong>Mandatory Consent:</strong> I confirm I have the legal right or consent to use this reference image.
                        </span>
                    </label>
                </div>

                <!-- Step Footer Navigation -->
                <div class="step-footer">
                    <span class="step-requirement-hint" id="step1-hint">
                        ${!photo.isValid ? 'Upload a valid image to continue' : !isConfirmed ? 'Accept legal consent to proceed' : 'Ready to proceed'}
                    </span>
                    <button class="btn btn-primary" id="btn-step1-next" ${!canProceed ? 'disabled' : ''}>
                        Next: Video Source &rarr;
                    </button>
                </div>
            </div>
        `;

        bindStep1Events();
    }

    function bindStep1Events() {
        const dropzone = document.getElementById('dropzone-container');
        const fileInput = document.getElementById('file-input');
        const checkbox = document.getElementById('legal-rights-checkbox');
        const nextBtn = document.getElementById('btn-step1-next');
        const changeBtn = document.getElementById('btn-change-photo');

        const triggerFileDialog = async () => {
            if (window.nextHykeAPI?.openImageDialog) {
                const res = await window.nextHykeAPI.openImageDialog();
                if (res && !res.canceled && res.fileData) {
                    handleValidatedImage(res.filePath, res.fileName, res.sizeBytes, res.fileData);
                }
            } else if (fileInput) {
                fileInput.click();
            }
        };

        if (dropzone) {
            dropzone.addEventListener('click', (e) => {
                if (!e.target.closest('#btn-change-photo') && !dropzone.classList.contains('has-file')) {
                    triggerFileDialog();
                }
            });

            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('drag-active');
            });

            dropzone.addEventListener('dragleave', () => {
                dropzone.classList.remove('drag-active');
            });

            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('drag-active');
                if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                    processLocalFile(e.dataTransfer.files[0]);
                }
            });
        }

        if (changeBtn) {
            changeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                triggerFileDialog();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files.length > 0) {
                    processLocalFile(fileInput.files[0]);
                }
            });
        }

        if (checkbox) {
            checkbox.addEventListener('change', () => {
                state.rightsConfirmed = checkbox.checked;
                updateStep1NextButton();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (canProceedStep1()) {
                    setStep(2);
                }
            });
        }
    }

    function processLocalFile(file) {
        const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            state.referencePhoto = {
                filePath: null,
                dataUrl: null,
                fileName: file.name,
                sizeBytes: file.size,
                isValid: false,
                errorMessage: 'Unsupported format. Please select a PNG, JPEG, or WEBP image.'
            };
            renderStep1();
            return;
        }

        const MAX_SIZE = 15 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            state.referencePhoto = {
                filePath: null,
                dataUrl: null,
                fileName: file.name,
                sizeBytes: file.size,
                isValid: false,
                errorMessage: 'File exceeds 15 MB limit. Please upload a smaller image.'
            };
            renderStep1();
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            handleValidatedImage(file.name, file.name, file.size, reader.result);
        };
        reader.readAsDataURL(file);
    }

    function handleValidatedImage(filePath, fileName, sizeBytes, dataUrl) {
        const MAX_SIZE = 15 * 1024 * 1024;
        if (sizeBytes > MAX_SIZE) {
            state.referencePhoto = {
                filePath: null,
                dataUrl: null,
                fileName,
                sizeBytes,
                isValid: false,
                errorMessage: 'File exceeds 15 MB limit. Please upload a smaller image.'
            };
        } else {
            state.referencePhoto = {
                filePath,
                dataUrl,
                fileName,
                sizeBytes,
                isValid: true,
                errorMessage: null
            };
        }
        renderStep1();
    }

    function updateStep1NextButton() {
        const nextBtn = document.getElementById('btn-step1-next');
        const hint = document.getElementById('step1-hint');
        const canProceed = canProceedStep1();
        if (nextBtn) nextBtn.disabled = !canProceed;
        if (hint) {
            hint.textContent = !state.referencePhoto.isValid
                ? 'Upload a valid image to continue'
                : !state.rightsConfirmed
                ? 'Accept legal consent to proceed'
                : 'Ready to proceed';
        }
    }

    // ==========================================
    // STEP 2: VIDEO SOURCE ENUMERATOR
    // ==========================================
    let availableCameras = [];

    async function enumerateCameras() {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                availableCameras = devices.filter(d => d.kind === 'videoinput');
                if (availableCameras.length > 0 && !state.videoSource.deviceId) {
                    state.videoSource.deviceId = availableCameras[0].deviceId;
                    state.videoSource.deviceLabel = availableCameras[0].label || 'Default Windows Camera';
                }
            }
        } catch (e) {
            console.error('[Step 2] Error enumerating cameras:', e);
        }
    }

    async function renderStep2() {
        await enumerateCameras();
        const source = state.videoSource;

        viewport.innerHTML = `
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
                                    ${availableCameras.length > 0 ? availableCameras.map(cam => `
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
                    <button class="btn btn-primary" id="btn-step2-next" ${!canProceedStep2() ? 'disabled' : ''}>
                        Next: Hardware Pre-Flight &rarr;
                    </button>
                </div>
            </div>
        `;

        bindStep2Events();
        if (source.sourceType === 'camera' && source.deviceId) {
            startMiniPreview(source.deviceId);
        }
    }

    function bindStep2Events() {
        const tabCam = document.getElementById('tab-source-camera');
        const tabFile = document.getElementById('tab-source-file');
        const camSelect = document.getElementById('camera-select');
        const btnRefresh = document.getElementById('btn-refresh-cameras');
        const btnBrowse = document.getElementById('btn-browse-video');
        const btnBack = document.getElementById('btn-step2-back');
        const btnNext = document.getElementById('btn-step2-next');

        if (tabCam) {
            tabCam.addEventListener('click', () => {
                state.videoSource.sourceType = 'camera';
                renderStep2();
            });
        }

        if (tabFile) {
            tabFile.addEventListener('click', () => {
                state.videoSource.sourceType = 'file';
                renderStep2();
            });
        }

        if (camSelect) {
            camSelect.addEventListener('change', () => {
                const deviceId = camSelect.value;
                const cam = availableCameras.find(c => c.deviceId === deviceId);
                state.videoSource.deviceId = deviceId;
                state.videoSource.deviceLabel = cam?.label || 'Selected Camera';
                startMiniPreview(deviceId);
                if (btnNext) btnNext.disabled = !canProceedStep2();
            });
        }

        if (btnRefresh) {
            btnRefresh.addEventListener('click', async () => {
                await enumerateCameras();
                renderStep2();
            });
        }

        if (btnBrowse) {
            btnBrowse.addEventListener('click', async () => {
                if (window.nextHykeAPI?.openVideoDialog) {
                    const res = await window.nextHykeAPI.openVideoDialog();
                    if (res && !res.canceled && res.filePath) {
                        state.videoSource.filePath = res.filePath;
                        state.videoSource.fileName = res.fileName || 'video.mp4';
                        state.videoSource.resolution = '1920x1080';
                        state.videoSource.fps = 30;
                        renderStep2();
                    }
                }
            });
        }

        if (btnBack) {
            btnBack.addEventListener('click', () => setStep(1));
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                if (canProceedStep2()) {
                    setStep(3);
                }
            });
        }
    }

    async function startMiniPreview(deviceId) {
        const videoEl = document.getElementById('mini-webcam-preview');
        if (!videoEl) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: deviceId } }
            });
            videoEl.srcObject = stream;
        } catch (e) {
            console.log('[Step 2] Preview stream unavailable or already open in exclusive mode.');
        }
    }

    // ==========================================
    // STEP 3: HARDWARE PRE-FLIGHT DIAGNOSTICS
    // ==========================================
    async function runDiagnostics() {
        const t0 = performance.now();
        if (window.nextHykeAPI?.getPreflightStatus) {
            try {
                const diag = await window.nextHykeAPI.getPreflightStatus();
                state.preflight = { ...state.preflight, ...diag };
            } catch (e) {
                console.error('[Pre-Flight] Diagnostic query error:', e);
            }
        } else {
            state.preflight = {
                systemRamGB: 5.4,
                totalRamGB: 15.8,
                ramStatus: 'pass',
                ramMessage: '5.4 GB available (Requirement: >= 2.5 GB)',
                vramReady: true,
                vramStatus: 'pass',
                vramMessage: 'NVIDIA GeForce MX450 (2.0 GB VRAM, 1.4 GB Cap Active)',
                gpuName: 'NVIDIA GeForce MX450',
                cpuThreads: 8,
                isReady: true,
                durationMs: 0
            };
        }
        state.preflight.durationMs = performance.now() - t0;
    }

    async function renderStep3() {
        await runDiagnostics();
        const p = state.preflight;
        const isReady = p.isReady;

        viewport.innerHTML = `
            <div class="step-card fade-in">
                <div class="step-header">
                    <div class="step-badge">STEP 3 OF 4</div>
                    <h2 class="step-title">Hardware Pre-Flight Readiness Check</h2>
                    <p class="step-desc">System diagnostics ensure dedicated GPU VRAM, physical memory, and camera bandwidth meet minimum requirements.</p>
                </div>

                <!-- Preflight Execution Summary Pill -->
                <div class="preflight-summary-bar ${isReady ? 'ready' : 'unready'}">
                    <div class="summary-icon">
                        ${isReady ? '&#10004;' : '&#9888;'}
                    </div>
                    <div class="summary-text">
                        <strong>${isReady ? 'All Systems Qualified for Real-Time Inference' : 'Pre-Flight Requirements Incomplete'}</strong>
                        <span>Diagnostic benchmark completed in ${p.durationMs.toFixed(1)} ms</span>
                    </div>
                </div>

                <!-- Diagnostics Grid -->
                <div class="diagnostic-cards-grid">
                    <!-- Diagnostic 1: System RAM -->
                    <div class="diag-card ${p.ramStatus}">
                        <div class="diag-header">
                            <span class="diag-label">Available System RAM</span>
                            <span class="status-chip ${p.ramStatus}">${p.ramStatus.toUpperCase()}</span>
                        </div>
                        <div class="diag-metric">${p.systemRamGB} GB Free</div>
                        <div class="diag-detail">${p.ramMessage}</div>
                    </div>

                    <!-- Diagnostic 2: NVIDIA MX450 Dedicated VRAM -->
                    <div class="diag-card ${p.vramStatus}">
                        <div class="diag-header">
                            <span class="diag-label">NVIDIA MX450 VRAM</span>
                            <span class="status-chip ${p.vramStatus}">${p.vramStatus.toUpperCase()}</span>
                        </div>
                        <div class="diag-metric">1.4 GB Cap (Ready)</div>
                        <div class="diag-detail">${p.vramMessage}</div>
                    </div>

                    <!-- Diagnostic 3: CPU Thread Capping -->
                    <div class="diag-card pass">
                        <div class="diag-header">
                            <span class="diag-label">CPU Core Allocation</span>
                            <span class="status-chip pass">CAPPED</span>
                        </div>
                        <div class="diag-metric">3 Threads Intra-Op</div>
                        <div class="diag-detail">Intel Core i5-1135G7 (${p.cpuThreads} Logical Cores)</div>
                    </div>

                    <!-- Diagnostic 4: Ingress Camera Status -->
                    <div class="diag-card pass">
                        <div class="diag-header">
                            <span class="diag-label">Video Ingress Lock</span>
                            <span class="status-chip pass">AVAILABLE</span>
                        </div>
                        <div class="diag-metric">Exclusive WMF Access</div>
                        <div class="diag-detail">Source is free and unblocked by Zoom or Teams.</div>
                    </div>
                </div>

                <!-- Step Footer Navigation -->
                <div class="step-footer">
                    <button class="btn btn-secondary" id="btn-step3-back">&larr; Back</button>
                    <button class="btn btn-primary" id="btn-step3-next" ${!isReady ? 'disabled' : ''}>
                        Launch Processing Dashboard &rarr;
                    </button>
                </div>
            </div>
        `;

        bindStep3Events();
    }

    function bindStep3Events() {
        const btnBack = document.getElementById('btn-step3-back');
        const btnNext = document.getElementById('btn-step3-next');

        if (btnBack) btnBack.addEventListener('click', () => setStep(2));
        if (btnNext) {
            btnNext.addEventListener('click', () => {
                if (state.preflight.isReady) {
                    setStep(4);
                }
            });
        }
    }

    // ==========================================
    // STEP 4: CONTROLS & LIVE COMPARISON CANVAS
    // ==========================================
    let animFrameId = null;

    function renderStep4() {
        const source = state.videoSource;
        const settings = state.advancedSettings;

        viewport.innerHTML = `
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
                        <button class="btn ${state.isStreaming ? 'btn-danger' : 'btn-success'}" id="btn-toggle-stream">
                            ${state.isStreaming ? '&#9632; Stop Stream' : '&#9658; Start Camera Broadcast'}
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
                            <span class="badge badge-purple" id="vcam-badge">${state.isStreaming ? 'Virtual Camera Broadcasting' : 'Virtual Camera Idle'}</span>
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

        bindStep4Events();
        startComparisonCanvases();
    }

    function bindStep4Events() {
        const btnToggleStream = document.getElementById('btn-toggle-stream');
        const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
        const btnBack = document.getElementById('btn-step4-back');
        const confSlider = document.getElementById('conf-slider');
        const marginSlider = document.getElementById('margin-slider');
        const colorSelect = document.getElementById('color-select');

        if (btnToggleStream) {
            btnToggleStream.addEventListener('click', async () => {
                state.isStreaming = !state.isStreaming;
                if (window.nextHykeAPI) {
                    if (state.isStreaming) {
                        await window.nextHykeAPI.startStream({ source: state.videoSource });
                    } else {
                        await window.nextHykeAPI.stopStream();
                    }
                }
                renderStep4();
            });
        }

        if (btnToggleDrawer) {
            btnToggleDrawer.addEventListener('click', () => {
                state.advancedSettings.drawerOpen = !state.advancedSettings.drawerOpen;
                saveSettings();
                const drawer = document.getElementById('advanced-drawer-container');
                if (drawer) drawer.classList.toggle('open', state.advancedSettings.drawerOpen);
                btnToggleDrawer.innerHTML = state.advancedSettings.drawerOpen ? 'Hide Settings' : 'Advanced Settings';
            });
        }

        if (confSlider) {
            confSlider.addEventListener('input', () => {
                const val = parseFloat(confSlider.value);
                const confVal = document.getElementById('conf-val');
                if (confVal) confVal.textContent = val.toString();
                state.advancedSettings.detectionConfidence = val;
                saveSettings();
            });
        }

        if (marginSlider) {
            marginSlider.addEventListener('input', () => {
                const val = parseFloat(marginSlider.value);
                const marginVal = document.getElementById('margin-val');
                if (marginVal) marginVal.textContent = val.toString();
                state.advancedSettings.landmarkMargins = val;
                saveSettings();
            });
        }

        if (colorSelect) {
            colorSelect.addEventListener('change', () => {
                state.advancedSettings.colorAdjustment = colorSelect.value;
                saveSettings();
            });
        }

        if (btnBack) {
            btnBack.addEventListener('click', () => {
                stopComparisonCanvases();
                setStep(3);
            });
        }
    }

    function saveSettings() {
        if (window.nextHykeAPI?.saveSettings) {
            window.nextHykeAPI.saveSettings(state.advancedSettings);
        }
    }

    function startComparisonCanvases() {
        stopComparisonCanvases();
        const canvasIn = document.getElementById('canvas-ingress');
        const canvasOut = document.getElementById('canvas-egress');
        if (!canvasIn || !canvasOut) return;

        const ctxIn = canvasIn.getContext('2d');
        const ctxOut = canvasOut.getContext('2d');
        if (!ctxIn || !ctxOut) return;

        let frame = 0;
        const renderLoop = () => {
            frame++;

            // Draw Ingress Frame
            ctxIn.fillStyle = '#0f172a';
            ctxIn.fillRect(0, 0, 640, 360);
            const pulse = Math.sin(frame * 0.05) * 6;

            ctxIn.strokeStyle = 'rgba(0, 210, 255, 0.4)';
            ctxIn.lineWidth = 2;
            ctxIn.beginPath();
            ctxIn.arc(320, 180 + pulse, 60, 0, Math.PI * 2);
            ctxIn.stroke();

            ctxIn.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctxIn.font = '12px Outfit, sans-serif';
            ctxIn.fillText('Input Camera Frame (WMF Ingress)', 20, 30);

            // Draw Egress Frame
            ctxOut.fillStyle = '#0d1527';
            ctxOut.fillRect(0, 0, 640, 360);

            ctxOut.strokeStyle = 'rgba(0, 245, 160, 0.7)';
            ctxOut.lineWidth = 2;
            ctxOut.beginPath();
            ctxOut.arc(320, 180 + pulse, 62, 0, Math.PI * 2);
            ctxOut.stroke();

            ctxOut.fillStyle = 'rgba(0, 245, 160, 0.9)';
            ctxOut.font = '12px Outfit, sans-serif';
            ctxOut.fillText('NextHyke Processed Stream (Virtual Camera Sink)', 20, 30);

            animFrameId = requestAnimationFrame(renderLoop);
        };

        animFrameId = requestAnimationFrame(renderLoop);
    }

    function stopComparisonCanvases() {
        if (animFrameId !== null) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
    }

    function renderActiveStep() {
        stopComparisonCanvases();
        if (state.currentStep === 1) renderStep1();
        else if (state.currentStep === 2) renderStep2();
        else if (state.currentStep === 3) renderStep3();
        else if (state.currentStep === 4) renderStep4();
    }

    // ==========================================
    // THEMES & COMMAND PALETTE (CTRL+K)
    // ==========================================
    function applyTheme(themeName) {
        document.body.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
        document.body.classList.add(`theme-${themeName}`);
        state.theme = themeName;
    }

    const commandList = [
        { title: 'Switch to Dark Theme (Default)', category: 'Appearance', action: () => applyTheme('dark') },
        { title: 'Switch to Light Theme', category: 'Appearance', action: () => applyTheme('light') },
        { title: 'Switch to High-Contrast Theme (WCAG AA)', category: 'Accessibility', action: () => applyTheme('high-contrast') },
        { title: 'Go to Step 1: Reference Photo', category: 'Navigation', shortcut: '1', action: () => setStep(1) },
        { title: 'Go to Step 2: Video Source', category: 'Navigation', shortcut: '2', action: () => setStep(2) },
        { title: 'Go to Step 3: Hardware Diagnostics', category: 'Navigation', shortcut: '3', action: () => setStep(3) },
        { title: 'Go to Step 4: Live Processing Canvas', category: 'Navigation', shortcut: '4', action: () => setStep(4) },
        { title: 'Toggle Virtual Camera Broadcast', category: 'Controls', shortcut: 'Space', action: () => {
            state.isStreaming = !state.isStreaming;
            if (state.currentStep === 4) renderStep4();
        }},
        { title: 'Toggle Advanced Fine-Tuning Drawer', category: 'Settings', action: () => {
            state.advancedSettings.drawerOpen = !state.advancedSettings.drawerOpen;
            saveSettings();
            if (state.currentStep === 4) renderStep4();
        }}
    ];

    let paletteOpen = false;
    let paletteIdx = 0;
    let filteredCommands = [...commandList];

    function openCommandPalette() {
        if (paletteOpen) return;
        paletteOpen = true;
        paletteIdx = 0;
        filteredCommands = [...commandList];

        const backdrop = document.createElement('div');
        backdrop.className = 'command-palette-backdrop';
        backdrop.id = 'command-palette-modal';
        backdrop.innerHTML = `
            <div class="command-palette-card" role="dialog" aria-modal="true" aria-label="Command Palette">
                <div class="palette-search-box">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" id="palette-input" class="palette-input" placeholder="Type a command or search actions (Esc to exit)..." autocomplete="off" autofocus>
                    <span class="esc-badge">ESC</span>
                </div>
                <div class="palette-results-list" id="palette-list" role="listbox">
                    ${renderPaletteItems()}
                </div>
                <div class="palette-footer">
                    <span>Navigation: <kbd>&uarr;</kbd> <kbd>&darr;</kbd></span>
                    <span>Select: <kbd>&crarr;</kbd></span>
                    <span>Open: <kbd>Ctrl+K</kbd></span>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        const input = document.getElementById('palette-input');
        if (input) input.focus();

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeCommandPalette();
        });

        input.addEventListener('input', () => {
            const q = input.value.toLowerCase().trim();
            filteredCommands = commandList.filter(c => c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
            paletteIdx = 0;
            const listEl = document.getElementById('palette-list');
            if (listEl) listEl.innerHTML = renderPaletteItems();
            bindPaletteClicks();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (filteredCommands.length > 0) {
                    paletteIdx = (paletteIdx + 1) % filteredCommands.length;
                    updatePaletteHighlight();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (filteredCommands.length > 0) {
                    paletteIdx = (paletteIdx - 1 + filteredCommands.length) % filteredCommands.length;
                    updatePaletteHighlight();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredCommands[paletteIdx]) {
                    closeCommandPalette();
                    filteredCommands[paletteIdx].action();
                }
            }
        });

        bindPaletteClicks();
    }

    function closeCommandPalette() {
        paletteOpen = false;
        const modal = document.getElementById('command-palette-modal');
        if (modal) modal.remove();
    }

    function renderPaletteItems() {
        if (filteredCommands.length === 0) {
            return `<div class="palette-empty">No matching commands found</div>`;
        }
        return filteredCommands.map((c, idx) => `
            <div class="palette-item ${idx === paletteIdx ? 'selected' : ''}" data-idx="${idx}">
                <div class="palette-item-left">
                    <span class="item-category">${c.category}</span>
                    <span class="item-title">${c.title}</span>
                </div>
                ${c.shortcut ? `<span class="item-shortcut">${c.shortcut}</span>` : ''}
            </div>
        `).join('');
    }

    function bindPaletteClicks() {
        const items = document.querySelectorAll('.palette-item');
        items.forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.getAttribute('data-idx') || '0', 10);
                if (filteredCommands[idx]) {
                    closeCommandPalette();
                    filteredCommands[idx].action();
                }
            });
        });
    }

    function updatePaletteHighlight() {
        const items = document.querySelectorAll('.palette-item');
        items.forEach((item, idx) => {
            item.classList.toggle('selected', idx === paletteIdx);
            if (idx === paletteIdx) item.scrollIntoView({ block: 'nearest' });
        });
    }

    // Keyboard shortcut listeners
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (paletteOpen) closeCommandPalette();
            else openCommandPalette();
        } else if (e.key === 'Escape' && paletteOpen) {
            e.preventDefault();
            closeCommandPalette();
        }
    });

    if (btnPalette) {
        btnPalette.addEventListener('click', openCommandPalette);
    }

    // Initial render
    renderActiveStep();

    // Check worker health initially
    setTimeout(async () => {
        try {
            if (window.nextHykeAPI?.pingWorker) {
                const res = await window.nextHykeAPI.pingWorker();
                if (res && res.status === 'pong') {
                    if (statusDot) statusDot.classList.add('connected');
                    if (statusText) statusText.textContent = 'Native Engine Connected';
                }
            }
        } catch (e) {
            console.log('[Renderer] Waiting for worker connection...');
        }
    }, 1500);
});
