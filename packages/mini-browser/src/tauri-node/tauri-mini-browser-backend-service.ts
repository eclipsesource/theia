// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs/promises';
import * as path from 'path';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Request, Response } from '@theia/core/shared/express';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { isUUID } from '@theia/core/lib/common/uuid';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { TauriUntrustedContentServer } from '@theia/core/lib/tauri-node/tauri-untrusted-content-server';
import { TauriMiniBrowserService } from '../common/tauri-mini-browser-service';

interface PreviewGrant {
    root: string;
    expires: number;
}

@injectable()
export class TauriMiniBrowserBackendService implements TauriMiniBrowserService, BackendApplicationContribution {
    protected readonly grants = new Map<string, PreviewGrant>();

    constructor(@inject(TauriUntrustedContentServer) protected readonly contentServer: TauriUntrustedContentServer) { }

    initialize(): void {
        this.contentServer.use('/', (request, response, next) => {
            this.serve(request, response).catch(() => response.sendStatus(404));
        });
    }

    async authorizeFile(uri: string, uuid: string): Promise<void> {
        if (!isUUID(uuid) || typeof uri !== 'string' || uri.length > 8192) {
            throw new Error('Invalid mini-browser preview request');
        }
        const resource = new URI(uri);
        if (resource.scheme !== 'file' || resource.authority) {
            throw new Error('Only local files can be previewed');
        }
        const file = await fs.realpath(FileUri.fsPath(resource));
        if (!(await fs.stat(file)).isFile()) {
            throw new Error('Mini-browser preview requires a file');
        }
        const now = Date.now();
        for (const [key, grant] of this.grants) {
            if (grant.expires < now) { this.grants.delete(key); }
        }
        if (this.grants.size >= 200) {
            this.grants.delete(this.grants.keys().next().value!);
        }
        this.grants.set(uuid.toLowerCase(), { root: path.dirname(file), expires: now + 30 * 60 * 1000 });
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
        const grant = this.grants.get(uuid);
        if (!grant || grant.expires < Date.now()) {
            response.sendStatus(403);
            return;
        }
        let relative: string;
        try {
            const requested = decodeURIComponent(request.path);
            relative = requested.startsWith('/mini-browser/') ? requested.slice('/mini-browser/'.length) : requested.replace(/^\//, '');
        } catch {
            response.sendStatus(400);
            return;
        }
        if (!relative || relative.includes('\0') || relative.includes('\\')
            || relative.split('/').some(segment => segment.startsWith('.'))) {
            response.sendStatus(403);
            return;
        }
        const target = path.resolve(grant.root, relative);
        let canonical: string;
        try {
            canonical = await fs.realpath(target);
            if (!(await fs.stat(canonical)).isFile()) {
                response.sendStatus(404);
                return;
            }
        } catch {
            response.sendStatus(404);
            return;
        }
        const scoped = path.relative(grant.root, canonical);
        if (!scoped || scoped === '..' || scoped.startsWith(`..${path.sep}`) || path.isAbsolute(scoped)) {
            response.sendStatus(403);
            return;
        }
        grant.expires = Date.now() + 30 * 60 * 1000;
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Content-Security-Policy', `frame-ancestors http://127.0.0.1:${request.socket.localPort}`);
        response.sendFile(canonical, { dotfiles: 'deny' });
    }
}
