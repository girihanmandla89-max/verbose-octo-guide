import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { EventEmitter } from 'events';

export class ProcessSupervisor extends EventEmitter {
    private workerProcess: ChildProcess | null = null;
    private isShuttingDown: boolean = false;
    private restartAttempts: number = 0;
    private maxRestartAttempts: number = 3;

    constructor(private sessionPid: number) {
        super();
    }

    public startWorker(): void {
        if (this.workerProcess) return;

        const appRoot = process.cwd();
        const pythonExe = path.resolve(appRoot, 'runtime/python.exe');
        const workerScript = path.resolve(appRoot, 'src/engine/worker.py');

        console.log(`[Supervisor] Spawning Python inference worker for session ${this.sessionPid}...`);
        console.log(`[Supervisor] Python: ${pythonExe}`);
        console.log(`[Supervisor] Script: ${workerScript}`);

        this.workerProcess = spawn(pythonExe, [
            workerScript,
            `--pipe-pid=${this.sessionPid}`
        ], {
            cwd: appRoot,
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.workerProcess.stdout?.on('data', (data) => {
            const msg = data.toString().trim();
            console.log(`[Worker stdout] ${msg}`);
            this.emit('worker-log', msg);
        });

        this.workerProcess.stderr?.on('data', (data) => {
            const err = data.toString().trim();
            console.error(`[Worker stderr] ${err}`);
            this.emit('worker-error', err);
        });

        this.workerProcess.on('exit', (code, signal) => {
            console.warn(`[Supervisor] Worker exited with code: ${code}, signal: ${signal}`);
            this.workerProcess = null;

            if (!this.isShuttingDown) {
                if (this.restartAttempts < this.maxRestartAttempts) {
                    this.restartAttempts++;
                    console.log(`[Supervisor] Attempting restart ${this.restartAttempts}/${this.maxRestartAttempts}...`);
                    setTimeout(() => this.startWorker(), 1000);
                } else {
                    this.emit('worker-crashed', { code, signal });
                }
            }
        });
    }

    public stopWorker(): void {
        this.isShuttingDown = true;
        if (this.workerProcess) {
            console.log('[Supervisor] Terminating worker process cleanly...');
            this.workerProcess.kill('SIGTERM');
            this.workerProcess = null;
        }
    }

    public isAlive(): boolean {
        return this.workerProcess !== null && !this.workerProcess.killed;
    }
}
