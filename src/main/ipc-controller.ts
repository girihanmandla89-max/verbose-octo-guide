import * as net from 'net';
import { EventEmitter } from 'events';

export const PIPE_MAGIC = 0x48594B45; // "HYKE"
export const HEADER_SIZE = 16; // 4 * uint32

export enum CommandType {
    CMD_INIT = 1,
    CMD_LOAD_MODELS = 2,
    CMD_START_STREAM = 3,
    CMD_STOP_STREAM = 4,
    CMD_GET_TELEMETRY = 5,
    CMD_HEARTBEAT = 6,
    CMD_SHUTDOWN = 99
}

interface PendingRequest {
    resolve: (data: any) => void;
    reject: (err: Error) => void;
    timeoutTimer: NodeJS.Timeout;
}

export class IpcController extends EventEmitter {
    private server: net.Server | null = null;
    private clientSocket: net.Socket | null = null;
    private pipePath: string;
    private sequenceId: number = 0;
    private pendingRequests: Map<number, PendingRequest> = new Map();
    private rxBuffer: Buffer = Buffer.alloc(0);

    constructor(private sessionPid: number) {
        super();
        this.pipePath = `\\\\.\\pipe\\NextHyke_Control_${this.sessionPid}`;
    }

    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket) => {
                console.log('[IpcController] Python worker connected to Named Pipe.');
                this.clientSocket = socket;
                this.emit('connected');

                socket.on('data', (chunk) => {
                    this.handleIncomingData(chunk);
                });

                socket.on('close', () => {
                    console.log('[IpcController] Python worker disconnected from Named Pipe.');
                    this.clientSocket = null;
                    this.emit('disconnected');
                });

                socket.on('error', (err) => {
                    console.error('[IpcController] Pipe socket error:', err);
                    this.emit('error', err);
                });
            });

            this.server.on('error', (err) => {
                console.error('[IpcController] Pipe server error:', err);
                reject(err);
            });

            this.server.listen(this.pipePath, () => {
                console.log(`[IpcController] Pipe server listening on ${this.pipePath}`);
                resolve();
            });
        });
    }

    public sendCommand(cmd: CommandType, payload: any = {}, timeoutMs: number = 5000): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.clientSocket || this.clientSocket.destroyed) {
                return reject(new Error('Named pipe client is not connected'));
            }

            this.sequenceId++;
            const seq = this.sequenceId;
            const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf-8');

            const headerBuf = Buffer.alloc(HEADER_SIZE);
            headerBuf.writeUInt32LE(PIPE_MAGIC, 0);
            headerBuf.writeUInt32LE(cmd, 4);
            headerBuf.writeUInt32LE(payloadBuf.length, 8);
            headerBuf.writeUInt32LE(seq, 12);

            const timer = setTimeout(() => {
                if (this.pendingRequests.has(seq)) {
                    this.pendingRequests.delete(seq);
                    reject(new Error(`Command ${cmd} (seq: ${seq}) timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);

            this.pendingRequests.set(seq, {
                resolve,
                reject,
                timeoutTimer: timer
            });

            const packet = Buffer.concat([headerBuf, payloadBuf]);
            this.clientSocket.write(packet);
        });
    }

    private handleIncomingData(chunk: Buffer): void {
        this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);

        while (this.rxBuffer.length >= HEADER_SIZE) {
            const magic = this.rxBuffer.readUInt32LE(0);
            if (magic !== PIPE_MAGIC) {
                console.error(`[IpcController] Corrupted packet header magic: 0x${magic.toString(16)}`);
                this.rxBuffer = Buffer.alloc(0);
                return;
            }

            const cmd = this.rxBuffer.readUInt32LE(4);
            const payloadLen = this.rxBuffer.readUInt32LE(8);
            const seq = this.rxBuffer.readUInt32LE(12);

            if (this.rxBuffer.length < HEADER_SIZE + payloadLen) {
                // Wait for complete payload
                break;
            }

            const payloadBytes = this.rxBuffer.subarray(HEADER_SIZE, HEADER_SIZE + payloadLen);
            this.rxBuffer = this.rxBuffer.subarray(HEADER_SIZE + payloadLen);

            let payloadObj: any = {};
            if (payloadLen > 0) {
                try {
                    payloadObj = JSON.parse(payloadBytes.toString('utf-8'));
                } catch (e) {
                    console.error('[IpcController] Failed to parse payload JSON:', e);
                }
            }

            // Check if this matches a pending request
            if (this.pendingRequests.has(seq)) {
                const req = this.pendingRequests.get(seq)!;
                clearTimeout(req.timeoutTimer);
                this.pendingRequests.delete(seq);
                req.resolve(payloadObj);
            } else {
                this.emit('message', { cmd, payload: payloadObj, seq });
            }
        }
    }

    public stop(): Promise<void> {
        return new Promise((resolve) => {
            // Clear pending requests
            for (const [, req] of this.pendingRequests) {
                clearTimeout(req.timeoutTimer);
                req.reject(new Error('IPC controller stopped'));
            }
            this.pendingRequests.clear();

            if (this.clientSocket) {
                this.clientSocket.destroy();
                this.clientSocket = null;
            }

            if (this.server) {
                this.server.close(() => {
                    this.server = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public isConnected(): boolean {
        return this.clientSocket !== null && !this.clientSocket.destroyed;
    }
}
