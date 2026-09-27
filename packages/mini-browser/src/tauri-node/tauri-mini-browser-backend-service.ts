// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as http from 'http';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Request, Response } from '@theia/core/shared/express';
import { isUUID } from '@theia/core/lib/common/uuid';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { TauriRemoteGateway } from '@theia/core/lib/tauri-node/messaging/tauri-remote-gateway';
import { TauriUntrustedContentServer } from '@theia/core/lib/tauri-node/tauri-untrusted-content-server';
import { TauriMiniBrowserService } from '../common/tauri-mini-browser-service';
import { TauriMiniBrowserFileGrants } from './tauri-mini-browser-file-grants';

interface RemotePreviewGrant {
    sessionId: string;
    expires: number;
}

@injectable()
export class TauriMiniBrowserBackendService implements TauriMiniBrowserService, BackendApplicationContribution {
    protected readonly localGrants = new TauriMiniBrowserFileGrants();
    protected readonly remoteGrants = new Map<string, RemotePreviewGrant>();

    @inject(TauriRemoteGateway)
    protected readonly gateway: TauriRemoteGateway;

    constructor(@inject(TauriUntrustedContentServer) protected readonly contentServer: TauriUntrustedContentServer) { }

    initialize(): void {
        this.contentServer.use('/', (request, response, next) => {
            this.serve(request, response).catch(() => response.sendStatus(404));
        });
    }

    async authorizeFile(uri: string, uuid: string, sessionId?: string): Promise<void> {
        if (!sessionId) {
            return this.localGrants.authorizeFile(uri, uuid);
        }
        if (!isUUID(uuid) || typeof uri !== 'string' || uri.length > 8192) {
            throw new Error('Invalid mini-browser preview request');
        }
        const connection = this.gateway.getSessionConnection(sessionId);
        if (!connection) {
            throw new Error('Remote preview session is closed');
        }
        const body = Buffer.from(JSON.stringify({ uri, uuid }));
        await new Promise<void>((resolve, reject) => {
            const request = http.request({
                hostname: '127.0.0.1', port: connection.port, path: '/tauri-mini-browser/grant', method: 'POST',
                headers: {
                    'X-Theia-Remote-Token': connection.token,
                    'Content-Type': 'application/json',
                    'Content-Length': body.length
                }
            }, response => {
                response.resume();
                response.on('end', () => response.statusCode === 204
                    ? resolve() : reject(new Error(`Remote preview refused with HTTP ${response.statusCode}`)));
            });
            request.on('error', reject);
            request.end(body);
        });
        const now = Date.now();
        for (const [key, grant] of this.remoteGrants) {
            if (grant.expires < now || !this.gateway.getSessionPort(grant.sessionId)) { this.remoteGrants.delete(key); }
        }
        if (this.remoteGrants.size >= 200) {
            this.remoteGrants.delete(this.remoteGrants.keys().next().value!);
        }
        this.remoteGrants.set(uuid.toLowerCase(), { sessionId, expires: now + 30 * 60 * 1000 });
    }

    protected async serve(request: Request, response: Response): Promise<void> {
        const host = request.headers.host || '';
        const match = /^([0-9a-f-]{36})\.mini-browser\.localhost:(\d+)$/i.exec(host);
        if (!match || !isUUID(match[1]) || Number(match[2]) !== request.socket.localPort) {
            response.sendStatus(403);
            return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.sendStatus(405);
            return;
        }
        const uuid = match[1].toLowerCase();
        const relative = request.path.startsWith('/mini-browser/')
            ? request.path.slice('/mini-browser/'.length) : request.path.replace(/^\//, '');
        const remote = this.remoteGrants.get(uuid);
        if (remote) {
            if (remote.expires < Date.now()) {
                this.remoteGrants.delete(uuid);
                response.sendStatus(403);
                return;
            }
            this.serveRemote(request, response, uuid, relative, remote);
            return;
        }
        const result = await this.localGrants.resolveFile(uuid, relative);
        if (result.status !== 200) {
            response.sendStatus(result.status);
            return;
        }
        this.setPreviewHeaders(request, response);
        response.sendFile(result.file, { dotfiles: 'deny' });
    }

    protected serveRemote(request: Request, response: Response, uuid: string, relative: string, grant: RemotePreviewGrant): void {
        const connection = this.gateway.getSessionConnection(grant.sessionId);
        if (!connection) {
            this.remoteGrants.delete(uuid);
            response.sendStatus(403);
            return;
        }
        const upstream = http.request({
            hostname: '127.0.0.1', port: connection.port, method: request.method,
            path: `/tauri-mini-browser/${uuid}/${relative}`,
            headers: {
                'X-Theia-Remote-Token': connection.token,
                ...(request.headers.range && { Range: request.headers.range })
            }
        }, upstreamResponse => {
            this.setPreviewHeaders(request, response);
            for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
                const value = upstreamResponse.headers[name];
                if (value !== undefined) {
                    response.setHeader(name, value);
                }
            }
            response.status(upstreamResponse.statusCode || 502);
            if (upstreamResponse.statusCode === 200) {
                grant.expires = Date.now() + 30 * 60 * 1000;
            }
            upstreamResponse.pipe(response);
        });
        upstream.on('error', () => {
            if (response.headersSent) {
                response.destroy();
            } else {
                response.sendStatus(502);
            }
        });
        response.on('close', () => upstream.destroy());
        upstream.end();
    }

    protected setPreviewHeaders(request: Request, response: Response): void {
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Content-Security-Policy', `frame-ancestors http://127.0.0.1:${request.socket.localPort}`);
    }
}
