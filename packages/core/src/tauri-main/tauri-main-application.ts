// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChildProcess, fork } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { AddressInfo, createConnection, createServer, Server } from 'net';
import { existsSync } from 'fs';
import { mkdir, realpath, stat, unlink } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { dirname, isAbsolute, join, resolve as resolvePath } from 'path';
import { inject, injectable, named } from 'inversify';
import { ContributionProvider } from '../common/contribution-provider';

export const TauriMainApplicationContribution = Symbol('TauriMainApplicationContribution');

/** A Node-side desktop lifecycle hook. Native operations are exposed through the host protocol. */
export interface TauriMainApplicationContribution {
    onStart?(application: TauriMainApplication): Promise<void> | void;
    /** Claim a launch so its window starts empty while the contribution performs its startup workflow. */
    claimsLaunch?(args: readonly string[]): Promise<boolean> | boolean;
    onStop?(application: TauriMainApplication): Promise<void> | void;
}

export interface TauriLaunchOptions {
    backendPath: string;
    args: string[];
}

type ControllerState = 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

interface WindowSession {
    label: string;
    backend: ChildProcess;
    token: string;
    cookieName: string;
    port: number;
}

interface PendingRequest {
    session: WindowSession;
    backendId: number;
    timer: NodeJS.Timeout;
}

@injectable()
export class TauriMainApplication {
    protected state: ControllerState = 'starting';
    protected readonly contributions: TauriMainApplicationContribution[];
    protected readonly windows = new Map<string, WindowSession>();
    protected readonly nativeRequests = new Map<number, PendingRequest>();
    protected readonly closeRequests = new Map<number, { session: WindowSession; timer: NodeJS.Timeout }>();
    protected readonly creatingWindows = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
    protected nextNativeId = 0;
    protected options: TauriLaunchOptions;
    protected instanceServer: Server | undefined;
    protected instanceSocket: string | undefined;
    protected readyResolve: () => void;
    protected readonly readyPromise = new Promise<void>(resolveReady => this.readyResolve = resolveReady);

    constructor(@inject(ContributionProvider) @named(TauriMainApplicationContribution)
        contributions: ContributionProvider<TauriMainApplicationContribution>) {
        this.contributions = contributions.getContributions();
    }

    async start(options: TauriLaunchOptions): Promise<void> {
        this.options = { backendPath: resolvePath(options.backendPath), args: options.args };
        try {
            if (await this.forwardOrListen(this.options)) {
                this.send({ version: 1, type: 'forwarded' });
                return;
            }
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
            const claimed = await this.isClaimed(options.args);
            const initialUrl = this.launchUrl(options.args);
            const fragment = claimed ? '!empty' : await this.launchFragment(options.args, process.cwd(), '');
            const session = await this.startBackend('main', options.args, this.getBackendPort(options.args));
            this.state = 'ready';
            this.readyResolve();
            this.send({ version: 1, type: 'ready', window: session.label, url: this.windowUrl(session, fragment),
                token: session.token, cookieName: session.cookieName });
            if (initialUrl) {
                this.send({ version: 1, type: 'open-url', url: initialUrl });
            }
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
                        } else if (request.type === 'window-destroyed') {
                            this.handleWindowDestroyed(request);
                        } else if (request.type === 'window-created') {
                            this.handleWindowCreated(request);
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

    protected async forwardOrListen(options: TauriLaunchOptions): Promise<boolean> {
        const applicationRoot = dirname(dirname(dirname(options.backendPath)));
        const profile = resolvePath(process.env.THEIA_CONFIG_DIR || (existsSync(join(applicationRoot, 'data'))
            ? join(applicationRoot, 'data', 'user-data') : join(homedir(), '.theia')));
        const digest = createHash('sha256').update(`${options.backendPath}\0${profile}`).digest('hex').slice(0, 24);
        const directory = join(tmpdir(), `theia-tauri-${process.getuid?.() ?? 'user'}-${digest}`);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const metadata = await stat(directory);
        if (!metadata.isDirectory() || process.getuid && metadata.uid !== process.getuid() || metadata.mode & 0o077) {
            throw new Error('Tauri instance directory is not private');
        }
        const socketPath = join(directory, 'instance.sock');
        for (let attempt = 0; attempt < 3; attempt++) {
            let unavailableCode: string | undefined;
            try {
                await this.forwardLaunch(socketPath, options.args);
                return true;
            } catch (error) {
                if (!this.isSocketUnavailable(error)) {
                    throw error;
                }
                unavailableCode = (error as NodeJS.ErrnoException).code;
            }
            if (unavailableCode === 'ECONNREFUSED' && existsSync(socketPath)) {
                await unlink(socketPath).catch(error => {
                    if (error.code !== 'ENOENT') { throw error; }
                });
            }
            const server = createServer(socket => this.handleForwardedConnection(socket));
            try {
                await new Promise<void>((resolveListen, reject) => {
                    server.once('error', reject);
                    server.listen(socketPath, () => { server.off('error', reject); resolveListen(); });
                });
                this.instanceServer = server;
                this.instanceSocket = socketPath;
                return false;
            } catch (error) {
                if (!this.isSocketUnavailable(error)) { throw error; }
            }
        }
        throw new Error('Could not acquire Tauri profile instance');
    }

    protected isSocketUnavailable(error: unknown): boolean {
        return typeof error === 'object' && !!error && 'code' in error
            && (error.code === 'ENOENT' || error.code === 'ECONNREFUSED' || error.code === 'EADDRINUSE');
    }

    protected forwardLaunch(socketPath: string, args: string[]): Promise<void> {
        return new Promise((resolveForward, reject) => {
            const socket = createConnection(socketPath);
            let response = '';
            const timer = setTimeout(() => { socket.destroy(); reject(new Error('Tauri instance forwarding timed out')); }, 50000);
            socket.once('error', error => { clearTimeout(timer); reject(error); });
            socket.once('connect', () => socket.write(`${JSON.stringify({ version: 1, args, cwd: process.cwd() })}\n`));
            socket.on('data', chunk => {
                response += chunk.toString();
                if (response.length > 65536) {
                    socket.destroy();
                    clearTimeout(timer);
                    reject(new Error('Invalid Tauri instance response'));
                } else if (response.includes('\n')) {
                    socket.end();
                    clearTimeout(timer);
                    try {
                        const result = JSON.parse(response.slice(0, response.indexOf('\n')));
                        if (result.ok === true) {
                            resolveForward();
                        } else {
                            reject(new Error(result.error || 'Forwarded launch failed'));
                        }
                    } catch (error) { reject(error); }
                }
            });
        });
    }

    protected handleForwardedConnection(socket: import('net').Socket): void {
        let input = '';
        socket.on('data', chunk => {
            input += chunk.toString();
            if (input.length > 65536) { socket.destroy(); return; }
            if (!input.includes('\n')) { return; }
            socket.removeAllListeners('data');
            (async () => {
                const request = JSON.parse(input.slice(0, input.indexOf('\n')));
                if (request.version !== 1 || !Array.isArray(request.args) || request.args.length > 256
                    || !request.args.every((arg: unknown) => typeof arg === 'string' && arg.length <= 8192)
                    || typeof request.cwd !== 'string' || !isAbsolute(request.cwd)) {
                    throw new Error('Invalid forwarded launch');
                }
                await this.readyPromise;
                if (this.state !== 'ready') { throw new Error('Desktop controller is unavailable'); }
                const launchUrl = this.launchUrl(request.args);
                if (launchUrl) {
                    this.send({ version: 1, type: 'open-url', url: launchUrl });
                    return;
                }
                const claimed = await this.isClaimed(request.args);
                const fragment = claimed ? '!empty' : await this.forwardedFragment(request.args, request.cwd);
                await this.openWindow(fragment, request.args, '', request.cwd);
            })().then(() => socket.end('{"ok":true}\n'), error => socket.end(`${JSON.stringify({ ok: false, error: String(error) })}\n`));
        });
    }

    protected async forwardedFragment(args: readonly string[], cwd: string): Promise<string> {
        return this.launchFragment(args, cwd, '!empty');
    }

    protected launchUrl(args: readonly string[]): string | undefined {
        const index = args.indexOf('--open-url');
        if (index < 0) {
            return undefined;
        }
        const value = args[index + 1];
        if (!value || value.length > 8192 || /[\r\n\0]/.test(value)) {
            throw new Error('Invalid --open-url value');
        }
        try {
            new URL(value);
        } catch {
            throw new Error('Invalid --open-url URL');
        }
        return value;
    }

    protected async launchFragment(args: readonly string[], cwd: string, missingFragment: string): Promise<string> {
        const valueOptions = new Set(['--port', '-p', '--hostname', '-h', '--plugins', '--ovsx-router-config', '--attach-container', '--open-url']);
        let candidate: string | undefined;
        for (let i = 0; i < args.length; i++) {
            const value = args[i];
            if (valueOptions.has(value)) { i++; continue; }
            if (!value.startsWith('-') && candidate === undefined) { candidate = value; }
        }
        if (!candidate) { return missingFragment; }
        const workspace = resolvePath(cwd, candidate);
        try {
            await realpath(workspace);
            return workspace;
        } catch {
            this.reportError('Could not resolve launch workspace', workspace);
            return missingFragment;
        }
    }

    protected async isClaimed(args: readonly string[]): Promise<boolean> {
        for (const contribution of this.contributions) {
            if (await contribution.claimsLaunch?.(args)) {
                return true;
            }
        }
        return false;
    }

    protected windowUrl(session: WindowSession, fragment: string, search = ''): string {
        const query = search ? `?${new URLSearchParams(search).toString()}` : '';
        return `http://127.0.0.1:${session.port}/${query}${fragment ? `#${encodeURI(fragment)}` : ''}`;
    }

    protected async availablePort(): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const server = createServer();
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const address = server.address() as AddressInfo;
                server.close(error => error ? reject(error) : resolve(address.port));
            });
        });
    }

    protected startBackend(label: string, args: string[], port: number, cwd = process.cwd()): Promise<WindowSession> {
        const token = randomBytes(32).toString('hex');
        const cookieName = label === 'main' ? 'THEIA_TAURI_TOKEN' : `THEIA_TAURI_TOKEN_${label.replace(/-/g, '')}`;
        return new Promise((resolve, reject) => {
            const backend = fork(this.options.backendPath, this.backendArgs(args, port), {
                execPath: process.execPath,
                cwd,
                stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
                env: { ...process.env, THEIA_PARENT_PID: String(process.pid), THEIA_TARGET: 'tauri', THEIA_TAURI_TOKEN: token,
                    THEIA_TAURI_COOKIE_NAME: cookieName, THEIA_TAURI_WINDOW_ID: label,
                    THEIA_MINI_BROWSER_HOST_PATTERN: `{{uuid}}.mini-browser.localhost:${port}`,
                    THEIA_WEBVIEW_EXTERNAL_ENDPOINT: `{{uuid}}.webview.localhost:${port}` }
            });
            const session: WindowSession = { label, backend, token, cookieName, port };
            let settled = false;
            backend.stdout?.on('data', chunk => process.stderr.write(chunk));
            let startupStderr = '';
            backend.stderr?.on('data', chunk => {
                process.stderr.write(chunk);
                if (!settled) {
                    startupStderr = (startupStderr + chunk.toString()).slice(-4096);
                }
            });
            backend.on('message', message => this.handleBackendMessage(session, message));
            const fail = (error: Error): void => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    backend.kill('SIGTERM');
                    reject(error);
                }
            };
            const timer = setTimeout(() => fail(new Error('Backend readiness timed out')), 30000);
            backend.once('message', message => {
                if (settled) { return; }
                clearTimeout(timer);
                if (typeof message === 'object' && message && 'port' in message && message.port === port
                    && 'address' in message && message.address === '127.0.0.1') {
                    settled = true;
                    this.windows.set(label, session);
                    resolve(session);
                } else {
                    fail(new Error(`Backend did not bind the requested loopback port ${port}`));
                }
            });
            backend.once('error', fail);
            backend.once('exit', (code, signal) => {
                clearTimeout(timer);
                if (!this.windows.has(label)) {
                    const error = new Error(`Backend exited before readiness: ${code ?? signal}`) as NodeJS.ErrnoException;
                    if (/EADDRINUSE/.test(startupStderr)) {
                        error.code = 'EADDRINUSE';
                    }
                    fail(error);
                } else if (this.state === 'ready') {
                    this.windows.delete(label);
                    this.cancelSessionRequests(session);
                    this.send({ version: 1, type: 'window-backend-exited', window: label });
                    this.reportError(`Backend for ${label} exited`, code ?? signal);
                    if (this.windows.size === 0) {
                        this.stop().catch(error => this.reportError('Could not stop after final backend exit', error));
                    }
                }
            });
        });
    }

    protected backendArgs(args: readonly string[], port: number): string[] {
        const result: string[] = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--port' || args[i] === '-p') {
                i++;
            } else if (!/^(?:--port|-p)=/.test(args[i])) {
                result.push(args[i]);
            }
        }
        result.push(`--port=${port}`);
        return result;
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

    protected handleBackendMessage(session: WindowSession, message: unknown): void {
        if (typeof message === 'object' && message && 'type' in message && message.type === 'close-response') {
            this.handleBackendCloseResponse(session, message);
            return;
        }
        if (typeof message !== 'object' || !message || !('type' in message) || message.type !== 'native-request'
            || !('id' in message) || typeof message.id !== 'number' || !Number.isSafeInteger(message.id)) {
            return;
        }
        const backendId = message.id;
        const respond = (error: string): void => {
            session.backend.send({ version: 1, type: 'native-response', id: backendId, ok: false, error });
        };
        if (this.state !== 'ready' || this.windows.get(session.label) !== session) {
            respond('Native request is unavailable');
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
        const validClipboardRead = 'operation' in message && message.operation === 'read-clipboard-text' && !('text' in message);
        const validClipboardWrite = 'operation' in message && message.operation === 'write-clipboard-text'
            && 'text' in message && typeof message.text === 'string' && message.text.length <= 1024 * 1024;
        const validNewWindow = 'operation' in message && message.operation === 'open-window'
            && 'fragment' in message && typeof message.fragment === 'string' && message.fragment.length <= 8192
            && !/[\r\n\0]/.test(message.fragment)
            && (!('search' in message) || typeof message.search === 'string' && message.search.length <= 4096
                && !/[\r\n\0#]/.test(message.search));
        const validMenu = 'operation' in message && message.operation === 'set-menu'
            && 'items' in message && this.isValidMenu(message.items);
        if (!('version' in message) || message.version !== 1 || !('window' in message) || message.window !== session.label
            || (!validTitle && !validOpenFile && !validDialog && !validWindowAction && !validZoom
                && !validClipboardRead && !validClipboardWrite && !validNewWindow && !validMenu)) {
            respond('Invalid native request');
            return;
        }
        if (validNewWindow) {
            this.openWindow(message.fragment as string, this.options.args, 'search' in message ? message.search as string : '')
                .then(() => session.backend.send({ version: 1, type: 'native-response', id: backendId, ok: true }),
                error => respond(String(error)));
            return;
        }
        const id = ++this.nextNativeId;
        const timer = setTimeout(() => {
            this.nativeRequests.delete(id);
            respond('Native host timed out');
        }, validOpenFile || validDialog ? 120000 : 9000);
        this.nativeRequests.set(id, { session, backendId, timer });
        this.send({ ...message, id });
    }

    protected isValidMenu(items: unknown, depth = 0, budget = { remaining: 500 }): boolean {
        if (!Array.isArray(items) || depth > 5 || items.length > 100) {
            return false;
        }
        return items.every(item => {
            if (--budget.remaining < 0 || typeof item !== 'object' || !item) {
                return false;
            }
            if (item.type === 'separator') {
                return item.id === undefined && item.label === undefined && item.submenu === undefined;
            }
            if (typeof item.label !== 'string' || !item.label || item.label.length > 120 || /[\r\n\0]/.test(item.label)
                || item.enabled !== undefined && typeof item.enabled !== 'boolean') {
                return false;
            }
            if (item.submenu !== undefined) {
                return item.id === undefined && item.type === undefined && item.checked === undefined
                    && this.isValidMenu(item.submenu, depth + 1, budget);
            }
            return typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(item.id)
                && (item.type === undefined || item.type === 'checkbox')
                && (item.checked === undefined || typeof item.checked === 'boolean');
        });
    }

    protected async openWindow(fragment: string, args: string[] = this.options.args, search = '', cwd = process.cwd()): Promise<void> {
        const label = `workspace-${randomBytes(8).toString('hex')}`;
        let session: WindowSession | undefined;
        for (let attempt = 0; attempt < 5; attempt++) {
            const port = await this.availablePort();
            try {
                session = await this.startBackend(label, args, port, cwd);
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt === 4) {
                    throw error;
                }
            }
        }
        if (!session) {
            throw new Error('Could not allocate a backend port');
        }
        try {
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.creatingWindows.delete(label);
                    reject(new Error('Native window creation timed out'));
                }, 15000);
                this.creatingWindows.set(label, { resolve, reject, timer });
                this.send({ version: 1, type: 'create-window', window: label, url: this.windowUrl(session, fragment, search),
                    token: session.token, cookieName: session.cookieName });
            });
        } catch (error) {
            this.windows.delete(label);
            session.backend.kill('SIGTERM');
            throw error;
        }
    }

    protected handleWindowCreated(message: unknown): void {
        if (typeof message !== 'object' || !message || !('window' in message) || typeof message.window !== 'string') {
            return;
        }
        const creation = this.creatingWindows.get(message.window);
        if (!creation) {
            return;
        }
        this.creatingWindows.delete(message.window);
        clearTimeout(creation.timer);
        if ('ok' in message && message.ok === true) {
            creation.resolve();
        } else {
            creation.reject(new Error('error' in message && typeof message.error === 'string' ? message.error : 'Native window creation failed'));
        }
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
            || !Number.isSafeInteger(message.id) || !('window' in message) || typeof message.window !== 'string') {
            throw new Error('Invalid close request');
        }
        const id = message.id;
        const session = this.windows.get(message.window);
        if (this.state !== 'ready' || this.closeRequests.has(id) || !session?.backend.connected) {
            this.send({ version: 1, type: 'close-response', id, window: message.window, allow: false });
            return;
        }
        const timer = setTimeout(() => {
            this.closeRequests.delete(id);
            this.send({ version: 1, type: 'close-response', id, window: session.label, allow: false });
        }, 15000);
        this.closeRequests.set(id, { session, timer });
        session.backend.send({ version: 1, type: 'close-request', id, window: session.label });
    }

    protected handleBackendCloseResponse(session: WindowSession, message: unknown): void {
        if (typeof message !== 'object' || !message || !('id' in message) || typeof message.id !== 'number') {
            return;
        }
        const request = this.closeRequests.get(message.id);
        if (!request || request.session !== session) {
            return;
        }
        clearTimeout(request.timer);
        this.closeRequests.delete(message.id);
        const allow = 'version' in message && message.version === 1 && 'allow' in message && message.allow === true;
        this.send({ version: 1, type: 'close-response', id: message.id, window: session.label, allow });
    }

    protected handleNativeResponse(message: unknown): void {
        if (typeof message !== 'object' || !message || !('id' in message) || typeof message.id !== 'number') {
            throw new Error('Invalid native response');
        }
        const request = this.nativeRequests.get(message.id);
        if (!request) {
            return;
        }
        clearTimeout(request.timer);
        this.nativeRequests.delete(message.id);
        const ok = 'ok' in message && message.ok === true;
        const error = 'error' in message && typeof message.error === 'string' ? message.error : 'Native operation failed';
        request.session.backend.send({ version: 1, type: 'native-response', id: request.backendId, ok,
            ...(ok && 'result' in message && { result: message.result }), ...(!ok && { error }) });
    }

    protected handleWindowDestroyed(message: unknown): void {
        if (typeof message !== 'object' || !message || !('window' in message) || typeof message.window !== 'string') {
            return;
        }
        const session = this.windows.get(message.window);
        if (!session) {
            return;
        }
        this.windows.delete(session.label);
        this.cancelSessionRequests(session);
        session.backend.kill('SIGTERM');
        if (this.windows.size === 0) {
            this.stop().catch(error => this.reportError('Could not stop after final window closed', error));
        }
    }

    protected cancelSessionRequests(session: WindowSession): void {
        for (const [id, request] of this.nativeRequests) {
            if (request.session === session) {
                clearTimeout(request.timer);
                this.nativeRequests.delete(id);
            }
        }
        for (const [id, request] of this.closeRequests) {
            if (request.session === session) {
                clearTimeout(request.timer);
                this.closeRequests.delete(id);
            }
        }
    }

    async stop(): Promise<void> {
        if (this.state === 'stopping' || this.state === 'stopped') {
            return;
        }
        this.state = 'stopping';
        this.readyResolve();
        this.instanceServer?.close();
        if (this.instanceSocket) {
            await unlink(this.instanceSocket).catch(error => {
                if (error.code !== 'ENOENT') { this.reportError('Could not remove instance socket', error); }
            });
        }
        for (const creation of this.creatingWindows.values()) {
            clearTimeout(creation.timer);
            creation.reject(new Error('Desktop controller is stopping'));
        }
        this.creatingWindows.clear();
        for (const request of this.nativeRequests.values()) {
            clearTimeout(request.timer);
            request.session.backend.send({ version: 1, type: 'native-response', id: request.backendId, ok: false, error: 'Desktop controller is stopping' });
        }
        this.nativeRequests.clear();
        for (const [id, request] of this.closeRequests) {
            clearTimeout(request.timer);
            this.send({ version: 1, type: 'close-response', id, window: request.session.label, allow: false });
        }
        this.closeRequests.clear();
        for (const contribution of [...this.contributions].reverse()) {
            try {
                await contribution.onStop?.(this);
            } catch (error) {
                this.reportError('Tauri contribution stop failed', error);
            }
        }
        await Promise.all([...this.windows.values()].map(async session => {
            const backend = session.backend;
            if (backend.exitCode === null) { // eslint-disable-line no-null/no-null
                backend.kill('SIGTERM');
                await Promise.race([
                    new Promise<void>(resolve => backend.once('exit', () => resolve())),
                    new Promise<void>(resolve => setTimeout(() => { backend.kill('SIGKILL'); resolve(); }, 5000))
                ]);
            }
        }));
        this.windows.clear();
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
