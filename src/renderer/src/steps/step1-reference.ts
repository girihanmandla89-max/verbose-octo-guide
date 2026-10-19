/**
 * Step 1: Reference Photo Picker & Rights Confirmation
 * Implements drag-and-drop reference image selector with MIME validation,
 * 15 MB limit check, and mandatory legal consent checkbox.
 */

import { WizardStateMachine } from '../wizard-state';

export class Step1Reference {
    private container: HTMLElement | null = null;

    constructor(private state: WizardStateMachine, private onNext: () => void) {}

    public render(targetElement: HTMLElement) {
        this.container = targetElement;
        const photo = this.state.referencePhoto;
        const isConfirmed = this.state.rightsConfirmed;
        const canProceed = this.state.canProceedStep1();

        targetElement.innerHTML = `
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

        this.bindEvents();
    }

    private bindEvents() {
        if (!this.container) return;

        const dropzone = this.container.querySelector('#dropzone-container') as HTMLElement;
        const fileInput = this.container.querySelector('#file-input') as HTMLInputElement;
        const checkbox = this.container.querySelector('#legal-rights-checkbox') as HTMLInputElement;
        const nextBtn = this.container.querySelector('#btn-step1-next') as HTMLButtonElement;
        const changeBtn = this.container.querySelector('#btn-change-photo') as HTMLButtonElement;

        const triggerFileDialog = async () => {
            if ((window as any).nextHykeAPI?.openImageDialog) {
                const res = await (window as any).nextHykeAPI.openImageDialog();
                if (res && !res.canceled && res.filePath && res.fileData) {
                    this.state.setReferencePhoto(res.filePath, res.fileName || 'reference.jpg', res.sizeBytes || 0, res.fileData);
                    this.render(this.container!);
                }
            } else if (fileInput) {
                fileInput.click();
            }
        };

        if (dropzone) {
            dropzone.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (!target.closest('#btn-change-photo') && !dropzone.classList.contains('has-file')) {
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
                    this.handleFile(e.dataTransfer.files[0]);
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
                    this.handleFile(fileInput.files[0]);
                }
            });
        }

        if (checkbox) {
            checkbox.addEventListener('change', () => {
                this.state.setRightsConfirmed(checkbox.checked);
                this.updateNextButtonState();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.state.canProceedStep1()) {
                    this.onNext();
                }
            });
        }
    }

    public handleFile(file: File) {
        const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            this.state.referencePhoto = {
                filePath: null,
                dataUrl: null,
                fileName: file.name,
                sizeBytes: file.size,
                isValid: false,
                errorMessage: 'Unsupported format. Please select a PNG, JPEG, or WEBP image.'
            };
            if (this.container) this.render(this.container);
            return;
        }

        const MAX_SIZE = 15 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            this.state.referencePhoto = {
                filePath: null,
                dataUrl: null,
                fileName: file.name,
                sizeBytes: file.size,
                isValid: false,
                errorMessage: 'File exceeds 15 MB limit. Please upload a smaller image.'
            };
            if (this.container) this.render(this.container);
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            this.state.setReferencePhoto(file.name, file.name, file.size, reader.result as string);
            if (this.container) this.render(this.container);
        };
        reader.readAsDataURL(file);
    }

    private updateNextButtonState() {
        if (!this.container) return;
        const nextBtn = this.container.querySelector('#btn-step1-next') as HTMLButtonElement;
        const hint = this.container.querySelector('#step1-hint') as HTMLElement;
        const canProceed = this.state.canProceedStep1();

        if (nextBtn) nextBtn.disabled = !canProceed;
        if (hint) {
            const photo = this.state.referencePhoto;
            const isConfirmed = this.state.rightsConfirmed;
            hint.textContent = !photo.isValid
                ? 'Upload a valid image to continue'
                : !isConfirmed
                ? 'Accept legal consent to proceed'
                : 'Ready to proceed';
        }
    }
}
