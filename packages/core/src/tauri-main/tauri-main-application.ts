// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChildProcess, fork } from 'child_process';
import { randomBytes } from 'crypto';
import { AddressInfo } from 'net';
import { inject, injectable, named } from 'inversify';
import { ContributionProvider } from '../common/contribution-provider';

export const TauriMainApplicationContribution = Symbol('TauriMainApplicationContribution');

/** A Node-side desktop lifecycle hook. Native operations are exposed through the host protocol. */
export interface TauriMainApplicationContribution {
    onStart?(application: TauriMainApplication): Promise<void> | void;
    claimsLaunch?(args: readonly string[]): Promise<boolean> | boolean;
    onStop?(application: TauriMainApplication): Promise<void> | void;
}

export interface TauriLaunchOptions {
    backendPath: string;
    args: string[];
}

type ControllerState = 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

@injectable()
export class TauriMainApplication {
    protected state: ControllerState = 'starting';
    protected backend: ChildProcess | undefined;
    protected readonly contributions: TauriMainApplicationContribution[];
    protected readonly securityToken = randomBytes(32).toString('hex');
    protected readonly nativeRequests = new Map<number, NodeJS.Timeout>();
    protected readonly closeRequests = new Map<number, NodeJS.Timeout>();

    constructor(@inject(ContributionProvider) @named(TauriMainApplicationContribution)
        contributions: ContributionProvider<TauriMainApplicationContribution>) {
        this.contributions = contributions.getContributions();
    }

    async start(options: TauriLaunchOptions): Promise<void> {
        try {
            const hostPid = process.ppid;
            setInterval(() => {
                try {
                    process.kill(hostPid, 0);
                } catch {
                    this.stop().catch(error => this.reportError('Could not stop after native host exit', error));
                }
            }, 1000).unref();
            for (const contribution of this.contributions) {
                await contribution.onStart?.(this);
            }
            // A claimed launch needs its own backend and window policy, which this first slice does not provide.
            for (const contribution of this.contributions) {
                if (await contribution.claimsLaunch?.(options.args)) {
                    throw new Error(`${contribution.constructor.name} claimed a Tauri launch, but claimed launches are not supported yet`);
                }
            }
            const address = await this.startBackend(options);
            this.state = 'ready';
            this.send({ version: 1, type: 'ready', url: `http://127.0.0.1:${address.port}/`, token: this.securityToken });
            process.stdin.setEncoding('utf8');
            let pending = '';
            process.stdin.on('data', (chunk: string) => {
                pending += chunk;
                for (let end = pending.indexOf('\n'); end !== -1; end = pending.indexOf('\n')) {
                    const line = pending.slice(0, end);
                    pending = pending.slice(end + 1);
                    try {
                        const request = JSON.parse(line);
                        if (request.version !== 1) {
                            throw new Error('Unsupported host protocol version');
                        }
                        if (request.type === 'stop') {
                            this.stop().catch(error => this.reportError('Could not stop desktop controller', error));
                        } else if (request.type === 'native-response') {
                            this.handleNativeResponse(request);
                        } else if (request.type === 'close-request') {
                            this.handleHostCloseRequest(request);
                        } else {
                            throw new Error('Unsupported host request');
                        }
                    } catch (error) {
                        this.reportError('Invalid host message', error);
                    }
                }
            });
            process.stdin.on('end', () => this.stop().catch(error => this.reportError('Could not stop after host disconnect', error)));
            for (const signal of ['SIGINT', 'SIGTERM'] as const) {
                process.on(signal, () => this.stop().catch(error => this.reportError('Could not stop after signal', error)));
            }
        } catch (error) {
            this.state = 'failed';
            this.send({ version: 1, type: 'error', message: String(error) });
            await this.stop();
            throw error;
        }
    }

    protected startBackend(options: TauriLaunchOptions): Promise<AddressInfo> {
        const port = this.getBackendPort(options.args);
        return new Promise((resolve, reject) => {
            const backend = this.backend = fork(options.backendPath, options.args, {
                execPath: process.execPath,
                stdio: ['inherit', 'pipe', 'inherit', 'ipc'],
                env: { ...process.env, THEIA_PARENT_PID: String(process.pid), THEIA_TARGET: 'tauri', THEIA_TAURI_TOKEN: this.securityToken,
                    THEIA_WEBVIEW_EXTERNAL_ENDPOINT: `{{uuid}}.webview.localhost:${port}` }
            });
            backend.stdout?.on('data', chunk => process.stderr.write(chunk));
            backend.on('message', message => this.handleBackendMessage(message));
            const timer = setTimeout(() => reject(new Error('Backend readiness timed out')), 30000);
            backend.once('message', message => {
                clearTimeout(timer);
                if (typeof message === 'object' && message && 'port' in message && message.port === port
                    && 'address' in message && message.address === '127.0.0.1') {
                    resolve(message as AddressInfo);
                } else {
                    reject(new Error(`Backend did not bind the requested loopback port ${port}`));
                }
            });
            backend.once('error', error => { clearTimeout(timer); reject(error); });
            backend.once('exit', (code, signal) => {
                clearTimeout(timer);
                if (this.state === 'starting') {
                    reject(new Error(`Backend exited before readiness: ${code ?? signal}`));
                } else if (this.state === 'ready') {
                    this.state = 'failed';
                    this.send({ version: 1, type: 'error', message: `Backend exited: ${code ?? signal}` });
                    process.exitCode = 1;
                }
            });
        });
    }

    protected getBackendPort(args: readonly string[]): number {
        let port = 3000;
        for (let i = 0; i < args.length; i++) {
            const value = args[i];
            const match = /^(?:--port|-p)=(.*)$/.exec(value);
            if (match || value === '--port' || value === '-p') {
                const candidate = match ? match[1] : args[++i];
                port = Number(candidate);
            }
            if (value === '--hostname' || value === '-h' || value.startsWith('--hostname=')) {
                const hostname = value.includes('=') ? value.slice(value.indexOf('=') + 1) : args[++i];
                if (hostname !== '127.0.0.1') {
                    throw new Error('Tauri backend must bind to 127.0.0.1');
                }
            }
        }
        if (!Number.isInteger(port) || port < 1 || port > 65534) {
            throw new Error('Tauri requires a fixed backend port in the range 1–65534');
        }
        return port;
    }

    protected handleBackendMessage(message: unknown): void {
        if (typeof message === 'object' && message && 'type' in message && message.type === 'close-response') {
            this.handleBackendCloseResponse(message);
            return;
        }
        if (typeof message !== 'object' || !message || !('type' in message) || message.type !== 'native-request') {
            return;
        }
        if (!('id' in message) || typeof message.id !== 'number' || !Number.isSafeInteger(message.id)) {
            return;
        }
        const id = message.id;
        if (this.state !== 'ready' || this.nativeRequests.has(id)) {
            this.backend?.send({ version: 1, type: 'native-response', id, ok: false, error: 'Native request is unavailable' });
            return;
        }
        const validTitle = 'operation' in message && message.operation === 'set-window-title'
            && 'title' in message && typeof message.title === 'string' && message.title.length >= 1
            && message.title.length <= 200 && !/[\r\n\0]/.test(message.title);
        const validOpenFile = 'operation' in message && message.operation === 'open-file' && !('title' in message);
        const validDialog = 'operation' in message && (message.operation === 'show-open-dialog' || message.operation === 'show-save-dialog')
            && 'options' in message && this.isValidDialogOptions(message.options);
        const validWindowAction = 'operation' in message && (message.operation === 'focus-window' || message.operation === 'minimize-window'
            || message.operation === 'toggle-maximize' || message.operation === 'toggle-fullscreen' || message.operation === 'close-window')
            && !('title' in message) && !('options' in message);
        const validZoom = 'operation' in message && message.operation === 'set-window-zoom'
            && 'zoomLevel' in message && typeof message.zoomLevel === 'number' && Number.isFinite(message.zoomLevel)
            && message.zoomLevel >= -8 && message.zoomLevel <= 9;
        const validClipboardRead = 'operation' in message && message.operation === 'read-clipboard-text'
            && !('text' in message);
        const validClipboardWrite = 'operation' in message && message.operation === 'write-clipboard-text'
            && 'text' in message && typeof message.text === 'string' && message.text.length <= 1024 * 1024;
        if (!('version' in message) || message.version !== 1 || !('window' in message) || message.window !== 'main'
            || (!validTitle && !validOpenFile && !validDialog && !validWindowAction && !validZoom && !validClipboardRead && !validClipboardWrite)) {
            this.backend?.send({ version: 1, type: 'native-response', id, ok: false, error: 'Invalid native request' });
            return;
        }
        const timer = setTimeout(() => {
            this.nativeRequests.delete(id);
            this.backend?.send({ version: 1, type: 'native-response', id, ok: false, error: 'Native host timed out' });
        }, validOpenFile || validDialog ? 120000 : 9000);
        this.nativeRequests.set(id, timer);
        this.send(message);
    }

    protected isValidDialogOptions(value: unknown): boolean {
        if (typeof value !== 'object' || !value || Array.isArray(value)) {
            return false;
        }
        const options = value as Record<string, unknown>;
        return (options.title === undefined || typeof options.title === 'string' && options.title.length <= 200)
            && (options.defaultPath === undefined || typeof options.defaultPath === 'string' && options.defaultPath.length <= 4096)
            && (options.directory === undefined || typeof options.directory === 'boolean')
            && (options.multiple === undefined || typeof options.multiple === 'boolean')
            && (options.filters === undefined || Array.isArray(options.filters) && options.filters.length <= 20
                && options.filters.every(filter => typeof filter === 'object' && !!filter
                    && typeof filter.name === 'string' && filter.name.length <= 100
                    && Array.isArray(filter.extensions) && filter.extensions.length <= 20
                    && filter.extensions.every((extension: unknown) => typeof extension === 'string' && /^[A-Za-z0-9*]{1,20}$/.test(extension))));
    }

    protected handleHostCloseRequest(message: unknown): void {
        if (typeof message !== 'object' || !message || !('id' in message) || typeof message.id !== 'number'
            || !Number.isSafeInteger(message.id) || !('window' in message) || message.window !== 'main') {
            throw new Error('Invalid close request');
        }
        const id = message.id;
        if (this.state !== 'ready' || this.closeRequests.has(id) || !this.backend?.connected) {
            this.send({ version: 1, type: 'close-response', id, allow: false });
            return;
        }
        const timer = setTimeout(() => {
            this.closeRequests.delete(id);
            this.send({ version: 1, type: 'close-response', id, allow: false });
        }, 15000);
        this.closeRequests.set(id, timer);
        this.backend.send({ version: 1, type: 'close-request', id, window: 'main' });
    }

    protected handleBackendCloseResponse(message: unknown): void {
        if (typeof message !== 'object' || !message || !('id' in message) || typeof message.id !== 'number') {
            return;
        }
        const timer = this.closeRequests.get(message.id);
        if (!timer) {
            return;
        }
        clearTimeout(timer);
        this.closeRequests.delete(message.id);
        const allow = 'version' in message && message.version === 1 && 'allow' in message && message.allow === true;
        this.send({ version: 1, type: 'close-response', id: message.id, allow });
    }

    protected handleNativeResponse(message: unknown): void {
        if (typeof message !== 'object' || !message || !('id' in message) || typeof message.id !== 'number') {
            throw new Error('Invalid native response');
        }
        const timer = this.nativeRequests.get(message.id);
        if (!timer) {
            return;
        }
        clearTimeout(timer);
        this.nativeRequests.delete(message.id);
        const ok = 'ok' in message && message.ok === true;
        const error = 'error' in message && typeof message.error === 'string' ? message.error : 'Native operation failed';
        this.backend?.send({ version: 1, type: 'native-response', id: message.id, ok,
            ...(ok && 'result' in message && { result: message.result }), ...(!ok && { error }) });
    }

    async stop(): Promise<void> {
        if (this.state === 'stopping' || this.state === 'stopped') {
            return;
        }
        this.state = 'stopping';
        for (const [id, timer] of this.nativeRequests) {
            clearTimeout(timer);
            this.backend?.send({ version: 1, type: 'native-response', id, ok: false, error: 'Desktop controller is stopping' });
        }
        this.nativeRequests.clear();
        for (const [id, timer] of this.closeRequests) {
            clearTimeout(timer);
            this.send({ version: 1, type: 'close-response', id, allow: false });
        }
        this.closeRequests.clear();
        for (const contribution of [...this.contributions].reverse()) {
            try {
                await contribution.onStop?.(this);
            } catch (error) {
                this.reportError('Tauri contribution stop failed', error);
            }
        }
        const backend = this.backend;
        if (backend && backend.exitCode === null) { // eslint-disable-line no-null/no-null
            backend.kill('SIGTERM');
            await Promise.race([
                new Promise<void>(resolve => backend.once('exit', () => resolve())),
                new Promise<void>(resolve => setTimeout(() => { backend.kill('SIGKILL'); resolve(); }, 5000))
            ]);
        }
        this.state = 'stopped';
        this.send({ version: 1, type: 'stopped' });
        process.exit();
    }

    protected send(message: object): void {
        process.stdout.write(`${JSON.stringify(message)}\n`);
    }

    protected reportError(context: string, error: unknown): void {
        process.stderr.write(`${context}: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    }
}
