// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '@theia/core/shared/reflect-metadata';
import * as fs from 'fs/promises';
import * as http from 'http';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { AddressInfo } from 'net';
import { EventEmitter } from 'events';
import { pathToFileURL } from 'url';
import { expect } from 'chai';
import { TauriUntrustedContentServer } from '@theia/core/lib/tauri-node/tauri-untrusted-content-server';
import { TauriMiniBrowserBackendService } from './tauri-mini-browser-backend-service';

class TestContentServer extends TauriUntrustedContentServer {
    get port(): number {
        return (this.server!.address() as AddressInfo).port;
    }
}

describe('Tauri mini-browser content', () => {
    let directory: string;
    let server: TestContentServer;
    let service: TauriMiniBrowserBackendService;

    beforeEach(async () => {
        directory = await fs.mkdtemp(path.join(tmpdir(), 'theia-mini-browser-'));
        await fs.mkdir(path.join(directory, 'preview'));
        await fs.writeFile(path.join(directory, 'preview', 'page.html'), '<h1>preview</h1>');
        await fs.writeFile(path.join(directory, 'preview', 'style.css'), 'body{}');
        await fs.writeFile(path.join(directory, 'outside.txt'), 'private');
        await fs.symlink(path.join(directory, 'outside.txt'), path.join(directory, 'preview', 'link.txt'));
        server = new TestContentServer();
        service = new TauriMiniBrowserBackendService(server);
        service.initialize();
        await server.onStart({ listening: true, address: () => ({ port: 0 }) } as http.Server);
    });

    afterEach(async () => {
        await server.onStop();
        await fs.rm(directory, { recursive: true, force: true });
    });

    async function get(port: number, host: string, url: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
        return new Promise((resolve, reject) => {
            http.get({ hostname: '::1', port, path: url, headers: { Host: host } }, response => {
                let body = '';
                response.on('data', chunk => body += chunk);
                response.on('end', () => resolve({ status: response.statusCode!, body, headers: response.headers }));
            }).on('error', reject);
        });
    }

    it('serves only files within a granted preview directory on its UUID host', async () => {
        const uuid = randomUUID();
        await service.authorizeFile(pathToFileURL(path.join(directory, 'preview', 'page.html')).toString(), uuid);
        const host = `${uuid}.mini-browser.localhost:${server.port}`;
        const page = await get(server.port, host, '/mini-browser/page.html');
        expect(page.status).to.equal(200);
        expect(page.body).to.contain('preview');
        expect(page.headers['referrer-policy']).to.equal('no-referrer');
        expect((await get(server.port, host, '/mini-browser/style.css')).status).to.equal(200);
        expect((await get(server.port, `${randomUUID()}.mini-browser.localhost:${server.port}`, '/mini-browser/page.html')).status).to.equal(403);
        expect((await get(server.port, `127.0.0.1:${server.port}`, '/mini-browser/page.html')).status).to.equal(403);
        expect((await get(server.port, host, '/mini-browser/%2e%2e%2foutside.txt')).status).to.equal(403);
        expect((await get(server.port, host, '/mini-browser/link.txt')).status).to.equal(403);
        expect((await get(server.port, host, '/mini-browser/.secret')).status).to.equal(403);
    });

    it('waits for the backend listener before choosing the isolated port', async () => {
        const lateServer = new TestContentServer();
        const backend = new EventEmitter() as http.Server;
        let listening = false;
        Object.defineProperty(backend, 'listening', { get: () => listening });
        backend.address = () => listening ? { port: 0 } as AddressInfo : null; // eslint-disable-line no-null/no-null
        const starting = lateServer.onStart(backend);
        listening = true;
        backend.emit('listening');
        try {
            await starting;
            expect(lateServer.port).to.be.greaterThan(0);
        } finally {
            await lateServer.onStop();
        }
    });

    it('serves webview assets before the catch-all preview route', async () => {
        const routedServer = new TestContentServer();
        routedServer.use('/', (_request, response) => response.sendStatus(403));
        routedServer.use('/webview', (_request, response) => response.send('asset'));
        await routedServer.onStart({ listening: true, address: () => ({ port: 0 }) } as http.Server);
        try {
            const result = await get(routedServer.port, `abc.webview.localhost:${routedServer.port}`, '/webview/host.js');
            expect(result.status).to.equal(200);
            expect(result.body).to.equal('asset');
        } finally {
            await routedServer.onStop();
        }
    });
});
