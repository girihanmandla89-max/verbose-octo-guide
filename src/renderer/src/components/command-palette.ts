/**
 * Feature 3.5: Global Command Palette (Ctrl+K) & Theme Switcher
 * Provides keyboard-first navigation and accessible Dark/Light/High-Contrast theme toggling.
 */

import { WizardStateMachine, ThemeType } from '../wizard-state';

export interface CommandItem {
    id: string;
    title: string;
    category: string;
    shortcut?: string;
    action: () => void;
}

export class CommandPalette {
    private isOpen: boolean = false;
    private selectedIndex: number = 0;
    private filteredCommands: CommandItem[] = [];
    private allCommands: CommandItem[] = [];
    private modalElement: HTMLElement | null = null;

    constructor(
        private state: WizardStateMachine,
        private onNavigateStep: (step: number) => void,
        private onToggleStream: () => void
    ) {
        this.initializeCommands();
        this.setupKeyboardListeners();
    }

    private initializeCommands() {
        this.allCommands = [
            {
                id: 'theme-dark',
                title: 'Switch to Dark Theme (Default)',
                category: 'Appearance',
                action: () => this.applyTheme('dark')
            },
            {
                id: 'theme-light',
                title: 'Switch to Light Theme',
                category: 'Appearance',
                action: () => this.applyTheme('light')
            },
            {
                id: 'theme-hc',
                title: 'Switch to High-Contrast Theme (WCAG AA)',
                category: 'Accessibility',
                action: () => this.applyTheme('high-contrast')
            },
            {
                id: 'nav-step1',
                title: 'Go to Step 1: Reference Photo Selection',
                category: 'Navigation',
                shortcut: '1',
                action: () => this.onNavigateStep(1)
            },
            {
                id: 'nav-step2',
                title: 'Go to Step 2: Video Source Selection',
                category: 'Navigation',
                shortcut: '2',
                action: () => this.onNavigateStep(2)
            },
            {
                id: 'nav-step3',
                title: 'Go to Step 3: Hardware Pre-Flight Diagnostics',
                category: 'Navigation',
                shortcut: '3',
                action: () => this.onNavigateStep(3)
            },
            {
                id: 'nav-step4',
                title: 'Go to Step 4: Live Processing Canvas',
                category: 'Navigation',
                shortcut: '4',
                action: () => this.onNavigateStep(4)
            },
            {
                id: 'stream-toggle',
                title: 'Toggle Virtual Camera Broadcast (Start/Stop)',
                category: 'Controls',
                shortcut: 'Space',
                action: () => this.onToggleStream()
            },
            {
                id: 'toggle-drawer',
                title: 'Toggle Advanced Fine-Tuning Drawer',
                category: 'Settings',
                action: () => {
                    const cur = this.state.advancedSettings.drawerOpen;
                    this.state.updateAdvancedSettings({ drawerOpen: !cur });
                }
            }
        ];
        this.filteredCommands = [...this.allCommands];
    }

    private setupKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.toggle();
            } else if (e.key === 'Escape' && this.isOpen) {
                e.preventDefault();
                this.close();
            }
        });
    }

    public toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    public open() {
        this.isOpen = true;
        this.selectedIndex = 0;
        this.filteredCommands = [...this.allCommands];
        this.renderModal();
    }

    public close() {
        this.isOpen = false;
        if (this.modalElement) {
            this.modalElement.remove();
            this.modalElement = null;
        }
    }

    public applyTheme(theme: ThemeType) {
        document.body.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
        document.body.classList.add(`theme-${theme}`);
        this.state.setTheme(theme);
        if ((window as any).nextHykeAPI?.saveSettings) {
            (window as any).nextHykeAPI.saveSettings({ theme });
        }
    }

    private renderModal() {
        if (this.modalElement) this.modalElement.remove();

        this.modalElement = document.createElement('div');
        this.modalElement.className = 'command-palette-backdrop';
        this.modalElement.id = 'command-palette-modal';

        this.modalElement.innerHTML = `
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
                    ${this.renderCommandList()}
                </div>
                <div class="palette-footer">
                    <span>Navigation: <kbd>&uarr;</kbd> <kbd>&darr;</kbd></span>
                    <span>Select: <kbd>&crarr;</kbd></span>
                    <span>Open Palette: <kbd>Ctrl+K</kbd></span>
                </div>
            </div>
        `;

        document.body.appendChild(this.modalElement);

        const input = this.modalElement.querySelector('#palette-input') as HTMLInputElement;
        input.focus();

        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.close();
            }
        });

        input.addEventListener('input', () => {
            const query = input.value.toLowerCase().trim();
            this.filteredCommands = this.allCommands.filter(
                cmd => cmd.title.toLowerCase().includes(query) || cmd.category.toLowerCase().includes(query)
            );
            this.selectedIndex = 0;
            const listEl = this.modalElement?.querySelector('#palette-list');
            if (listEl) listEl.innerHTML = this.renderCommandList();
            this.bindItemClicks();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.filteredCommands.length > 0) {
                    this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
                    this.updateSelectionHighlight();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.filteredCommands.length > 0) {
                    this.selectedIndex = (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
                    this.updateSelectionHighlight();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.filteredCommands[this.selectedIndex]) {
                    this.executeCommand(this.filteredCommands[this.selectedIndex]);
                }
            }
        });

        this.bindItemClicks();
    }

    private renderCommandList(): string {
        if (this.filteredCommands.length === 0) {
            return `<div class="palette-empty">No matching commands found</div>`;
        }

        return this.filteredCommands.map((cmd, idx) => `
            <div class="palette-item ${idx === this.selectedIndex ? 'selected' : ''}" data-idx="${idx}" role="option" aria-selected="${idx === this.selectedIndex}">
                <div class="palette-item-left">
                    <span class="item-category">${cmd.category}</span>
                    <span class="item-title">${cmd.title}</span>
                </div>
                ${cmd.shortcut ? `<span class="item-shortcut">${cmd.shortcut}</span>` : ''}
            </div>
        `).join('');
    }

    private bindItemClicks() {
        if (!this.modalElement) return;
        const items = this.modalElement.querySelectorAll('.palette-item');
        items.forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
                if (this.filteredCommands[idx]) {
                    this.executeCommand(this.filteredCommands[idx]);
                }
            });
        });
    }

    private updateSelectionHighlight() {
        if (!this.modalElement) return;
        const items = this.modalElement.querySelectorAll('.palette-item');
        items.forEach((el, idx) => {
            if (idx === this.selectedIndex) {
                el.classList.add('selected');
                el.scrollIntoView({ block: 'nearest' });
            } else {
                el.classList.remove('selected');
            }
        });
    }

    private executeCommand(cmd: CommandItem) {
        this.close();
        cmd.action();
    }
}
