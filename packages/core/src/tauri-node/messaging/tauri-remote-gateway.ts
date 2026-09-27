// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import { Duplex } from 'stream';
import { inject, injectable, named } from 'inversify';
import WebSocket = require('ws');
import { Disposable } from '../../common/disposable';
import { BackendApplicationContribution } from '../../node/backend-application';
import { WsRequestValidator } from '../../node/ws-request-validators';
import { ILogger } from '../../common/logger';

interface RemoteSession {
    port: number;
    token: string;
    sockets: Set<WebSocket>;
    requests: Set<http.ClientRequest>;
    onDidFail?: () => void;
}

/** Forwards one trusted Tauri window's remote service channel through its local backend. */
@injectable()
export class TauriRemoteGateway implements BackendApplicationContribution {
    @inject(WsRequestValidator)
    protected readonly validator: WsRequestValidator;
    @inject(ILogger) @named('core:TauriRemoteGateway')
    protected readonly logger: ILogger;

    protected readonly sessions = new Map<string, RemoteSession>();
    protected readonly webSocketServer = new WebSocket.Server({ noServer: true, maxPayload: 1e8 });

    getSessionPort(id: string): number | undefined {
        return this.sessions.get(id)?.port;
    }

    register(id: string, port: number, token: string, onDidFail?: () => void): Disposable {
        if (!/^[0-9a-f]{32}$/.test(id) || !Number.isInteger(port) || port < 1 || port > 65535 || !/^[0-9a-f]{64}$/.test(token)) {
            throw new Error('Invalid Tauri remote session');
        }
        if (this.sessions.has(id)) {
            throw new Error('Tauri remote session already exists');
        }
        const session: RemoteSession = { port, token, sockets: new Set(), requests: new Set(), onDidFail };
        this.sessions.set(id, session);
        return Disposable.create(() => this.disposeSession(id, session));
    }

    configure(app: express.Application): void {
        // The browser must keep using its authenticated local origin. Only file
        // downloads are forwarded; the remote token never reaches the browser.
        app.use('/tauri-remote/:id/files', (request, response) => this.forwardFiles(request, response));
    }

    protected forwardFiles(request: express.Request, response: express.Response): void {
        const id = request.params.id;
        const session = /^[0-9a-f]{32}$/.test(id) ? this.sessions.get(id) : undefined;
        if (!session) {
            response.sendStatus(404);
            return;
        }
        if (request.method !== 'GET' && request.method !== 'PUT') {
            response.sendStatus(405);
            return;
        }
        const path = `/files${request.url.startsWith('/') ? request.url : `/${request.url}`}`;
        // The generic file endpoint may have parsed JSON before this route was
        // registered, leaving no request stream to pipe for multi-file downloads.
        const body = request.method === 'PUT' && request.body !== undefined
            ? Buffer.from(JSON.stringify(request.body)) : undefined;
        const upstream = http.request({
            hostname: '127.0.0.1', port: session.port, method: request.method, path,
            headers: {
                'X-Theia-Remote-Token': session.token,
                ...(request.headers['content-type'] && { 'Content-Type': request.headers['content-type'] }),
                ...((body || request.headers['content-length']) && { 'Content-Length': body ? body.length : request.headers['content-length'] }),
                ...(request.headers.range && { Range: request.headers.range })
            }
        }, upstreamResponse => {
            const headers: http.OutgoingHttpHeaders = {};
            for (const name of ['content-type', 'content-disposition', 'content-length', 'accept-ranges', 'content-range', 'cache-control']) {
                const value = upstreamResponse.headers[name];
                if (value !== undefined) {
                    headers[name] = value;
                }
            }
            response.writeHead(upstreamResponse.statusCode || 502, headers);
            upstreamResponse.pipe(response);
        });
        session.requests.add(upstream);
        upstream.on('close', () => session.requests.delete(upstream));
        upstream.on('error', () => {
            if (response.headersSent) {
                response.destroy();
            } else {
                response.sendStatus(502);
            }
        });
        response.on('close', () => upstream.destroy());
        request.on('error', () => upstream.destroy());
        if (body) {
            upstream.end(body);
        } else {
            request.pipe(upstream);
        }
    }

    onStart(server: http.Server | https.Server): void {
        server.on('upgrade', (request, socket, head) => {
            try {
                const path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
                if (path.startsWith('/tauri-remote/')) {
                    this.upgrade(request, socket, head, path).catch(() => this.reject(socket, 403));
                }
            } catch {
                this.reject(socket, 403);
            }
        });
    }

    onStop(): void {
        for (const [id, session] of this.sessions) {
            this.disposeSession(id, session);
        }
        this.webSocketServer.close();
    }

    protected async upgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer, path: string): Promise<void> {
        if (!await this.validator.allowWsUpgrade(request)) {
            this.reject(socket, 403);
            return;
        }
        const id = /^\/tauri-remote\/([0-9a-f]{32})\/services$/.exec(path)?.[1];
        if (!id) {
            this.reject(socket, 404);
            return;
        }
        const session = this.sessions.get(id);
        if (!session) {
            this.reject(socket, 404);
            return;
        }
        const upstream = new WebSocket(`ws://127.0.0.1:${session.port}/tauri-services`, {
            headers: { 'X-Theia-Remote-Token': session.token }, maxPayload: 1e8
        });
        let settled = false;
        const fail = () => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                upstream.terminate();
                if (!socket.destroyed) {
                    this.reject(socket, 502);
                    this.failSession(id, session);
                }
            }
        };
        const timer = setTimeout(fail, 10000);
        socket.once('close', () => upstream.terminate());
        upstream.once('error', fail);
        upstream.once('unexpected-response', (_upgrade, response) => { response.resume(); fail(); });
        upstream.once('close', fail);
        upstream.once('open', () => {
            if (settled || socket.destroyed || this.sessions.get(id) !== session) {
                upstream.terminate();
                return;
            }
            settled = true;
            clearTimeout(timer);
            try {
                this.webSocketServer.handleUpgrade(request, socket, head, client => this.forward(client, upstream, id, session));
            } catch {
                upstream.terminate();
                socket.destroy();
            }
        });
    }

    protected forward(client: WebSocket, upstream: WebSocket, id: string, session: RemoteSession): void {
        session.sockets.add(client);
        session.sockets.add(upstream);
        client.on('message', (data, isBinary) => {
            if (upstream.readyState === WebSocket.OPEN) {
                upstream.send(data, { binary: isBinary });
            }
        });
        upstream.on('message', (data, isBinary) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data, { binary: isBinary });
            }
        });
        const close = (closed: WebSocket, peer: WebSocket) => {
            session.sockets.delete(closed);
            peer.terminate();
        };
        client.on('close', () => close(client, upstream));
        upstream.on('close', () => {
            const unexpected = client.readyState === WebSocket.OPEN;
            close(upstream, client);
            if (unexpected) {
                this.failSession(id, session);
            }
        });
        client.on('error', () => client.terminate());
        upstream.on('error', () => upstream.terminate());
    }

    protected disposeSession(id: string, session: RemoteSession): void {
        if (this.sessions.get(id) !== session) {
            return;
        }
        this.sessions.delete(id);
        for (const socket of session.sockets) {
            socket.terminate();
        }
        session.sockets.clear();
        for (const request of session.requests) {
            request.destroy();
        }
        session.requests.clear();
    }

    protected failSession(id: string, session: RemoteSession): void {
        if (this.sessions.get(id) !== session) {
            return;
        }
        this.disposeSession(id, session);
        try {
            session.onDidFail?.();
        } catch (error) {
            this.logger.error('Could not clean up failed Tauri remote session:', error);
        }
    }

    protected reject(socket: Duplex, status: 403 | 404 | 502): void {
        if (!socket.destroyed) {
            socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
        }
    }
}
