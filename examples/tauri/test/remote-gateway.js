// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const { randomBytes } = require('crypto');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const { TauriRemoteGateway } = require('@theia/core/lib/tauri-node/messaging/tauri-remote-gateway');

function listen(server) {
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
    return new Promise(resolve => server.close(resolve));
}

function connect(port, id, headers = {}) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/tauri-remote/${id}/services`, { headers });
        const timer = setTimeout(() => { socket.terminate(); reject(new Error('Gateway handshake timed out')); }, 5000);
        socket.once('open', () => { clearTimeout(timer); resolve(socket); });
        socket.once('unexpected-response', (_request, response) => {
            clearTimeout(timer);
            response.resume();
            resolve(response.statusCode);
        });
        socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
}

function nextMessage(socket) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Gateway message timed out')), 5000);
        socket.once('message', (data, binary) => { clearTimeout(timer); resolve({ data, binary }); });
    });
}

function nextClose(socket) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Gateway close timed out')), 5000);
        socket.once('close', () => { clearTimeout(timer); resolve(); });
    });
}

function requestHttp(port, path, options = {}) {
    return new Promise((resolve, reject) => {
        const request = http.request({ hostname: '127.0.0.1', port, path, method: options.method || 'GET', headers: options.headers }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
        });
        request.on('error', reject);
        request.end(options.body);
    });
}

async function run() {
    const token = randomBytes(32).toString('hex');
    const id = randomBytes(16).toString('hex');
    const upstreamServer = http.createServer((request, response) => {
        assert.equal(request.headers['x-theia-remote-token'], token);
        assert.equal(request.headers.cookie, undefined);
        assert.equal(request.headers.origin, undefined);
        if (request.method === 'GET' && request.url === '/files/?uri=file:///remote/proof.txt') {
            response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'remote-file', name: 'proof.txt' }));
        } else if (request.method === 'GET' && request.url === '/files/download/?id=remote-file') {
            response.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="proof.txt"' }).end('remote-file-content');
        } else if (request.method === 'PUT' && request.url === '/files/') {
            const chunks = [];
            request.on('data', chunk => chunks.push(chunk));
            request.on('end', () => response.writeHead(200, { 'Content-Type': 'application/json' }).end(Buffer.concat(chunks)));
        } else if (request.method === 'POST' && request.url === '/file-upload') {
            assert.equal(request.headers['content-type'], 'multipart/form-data; boundary=proof');
            const chunks = [];
            request.on('data', chunk => chunks.push(chunk));
            request.on('end', () => response.writeHead(200, { 'Content-Type': 'text/plain' }).end(Buffer.concat(chunks)));
        } else {
            response.writeHead(404).end();
        }
    });
    const upstreamWebSockets = new WebSocket.Server({ noServer: true });
    let upstreamConnections = 0;
    let upstreamClient;
    upstreamServer.on('upgrade', (request, socket, head) => {
        assert.equal(request.url, '/tauri-services');
        assert.equal(request.headers['x-theia-remote-token'], token);
        assert.equal(request.headers.origin, undefined);
        upstreamConnections++;
        upstreamWebSockets.handleUpgrade(request, socket, head, ws => {
            upstreamClient = ws;
            ws.on('message', (data, binary) => ws.send(data, { binary }));
        });
    });
    const upstreamPort = await listen(upstreamServer);
    const localApp = express();
    localApp.use((request, response, next) => {
        if (request.headers.cookie !== 'local=valid' ||
            (request.headers.origin && request.headers.origin !== `http://127.0.0.1:${request.socket.localPort}`)) {
            response.sendStatus(403);
        } else {
            next();
        }
    });
    localApp.use(express.json());
    const localServer = http.createServer(localApp);
    const gateway = new TauriRemoteGateway();
    Object.defineProperty(gateway, 'validator', {
        value: { allowWsUpgrade: request => request.headers.origin === `http://127.0.0.1:${request.socket.localPort}` && request.headers.cookie === 'local=valid' }
    });
    gateway.configure(localApp);
    gateway.onStart(localServer);
    const localPort = await listen(localServer);
    const allowed = { Origin: `http://127.0.0.1:${localPort}`, Cookie: 'local=valid' };
    let client;
    try {
        assert.throws(() => gateway.register('invalid', upstreamPort, token), /Invalid/);
        const registration = gateway.register(id, upstreamPort, token);
        assert.throws(() => gateway.register(id, upstreamPort, token), /already exists/);
        const filesPath = `/tauri-remote/${id}/files`;
        const uploadPath = `/tauri-remote/${id}/file-upload`;
        assert.equal((await requestHttp(localPort, `${filesPath}/?uri=file:///remote/proof.txt`)).status, 403);
        assert.equal((await requestHttp(localPort, `${filesPath}/?uri=file:///remote/proof.txt`, {
            headers: { Cookie: 'local=valid', Origin: 'http://untrusted.localhost' }
        })).status, 403);
        assert.equal((await requestHttp(localPort, `/tauri-remote/${randomBytes(16).toString('hex')}/files/`, {
            headers: { Cookie: 'local=valid' }
        })).status, 404);
        assert.equal((await requestHttp(localPort, `${filesPath}/`, {
            method: 'POST', headers: { Cookie: 'local=valid' }
        })).status, 405);
        const prepared = await requestHttp(localPort, `${filesPath}/?uri=file:///remote/proof.txt`, {
            headers: { Cookie: 'local=valid' }
        });
        assert.equal(prepared.status, 200);
        assert.deepEqual(JSON.parse(prepared.body.toString()), { id: 'remote-file', name: 'proof.txt' });
        const downloaded = await requestHttp(localPort, `${filesPath}/download/?id=remote-file`, {
            headers: { Cookie: 'local=valid' }
        });
        assert.equal(downloaded.status, 200);
        assert.equal(downloaded.body.toString(), 'remote-file-content');
        assert.equal(downloaded.headers['content-disposition'], 'attachment; filename="proof.txt"');
        const uploaded = await requestHttp(localPort, `${filesPath}/`, {
            method: 'PUT', headers: { Cookie: 'local=valid', 'Content-Type': 'application/json' }, body: '{"uris":[]}'
        });
        assert.equal(uploaded.status, 200);
        assert.equal(uploaded.body.toString(), '{"uris":[]}');
        assert.equal((await requestHttp(localPort, uploadPath, {
            method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=proof' }, body: 'upload-body'
        })).status, 403);
        assert.equal((await requestHttp(localPort, uploadPath, {
            method: 'GET', headers: { Cookie: 'local=valid' }
        })).status, 405);
        const upload = await requestHttp(localPort, uploadPath, {
            method: 'POST', headers: { Cookie: 'local=valid', 'Content-Type': 'multipart/form-data; boundary=proof' }, body: 'upload-body'
        });
        assert.equal(upload.status, 200);
        assert.equal(upload.body.toString(), 'upload-body');
        assert.equal(await connect(localPort, id), 403);
        assert.equal(await connect(localPort, id, { Origin: allowed.Origin }), 403);
        assert.equal(await connect(localPort, randomBytes(16).toString('hex'), allowed), 404);
        assert.equal(upstreamConnections, 0);
        client = await connect(localPort, id, allowed);
        const received = nextMessage(client);
        client.send(Buffer.from([0, 1, 2, 255]), { binary: true });
        assert.deepEqual(await received, { data: Buffer.from([0, 1, 2, 255]), binary: true });
        assert.equal(upstreamConnections, 1);
        const closed = nextClose(client);
        registration.dispose();
        await closed;
        client = undefined;
        assert.equal((await requestHttp(localPort, `${filesPath}/?uri=file:///remote/proof.txt`, {
            headers: { Cookie: 'local=valid' }
        })).status, 404);
        assert.equal((await requestHttp(localPort, uploadPath, {
            method: 'POST', headers: { Cookie: 'local=valid', 'Content-Type': 'multipart/form-data; boundary=proof' }, body: 'upload-body'
        })).status, 404);
        assert.equal(await connect(localPort, id, allowed), 404);
        assert.equal(upstreamConnections, 1);
        const failedId = randomBytes(16).toString('hex');
        let failures = 0;
        gateway.register(failedId, upstreamPort, token, () => failures++);
        client = await connect(localPort, failedId, allowed);
        const failedClose = nextClose(client);
        upstreamClient.close();
        await failedClose;
        client = undefined;
        assert.equal(failures, 1);
        assert.equal(gateway.getSessionPort(failedId), undefined);
        assert.equal(await connect(localPort, failedId, allowed), 404);
        assert.equal(upstreamConnections, 2);
        console.log('Tauri remote gateway forwarding passed');
    } finally {
        client?.terminate();
        gateway.onStop();
        await close(localServer);
        await new Promise(resolve => upstreamWebSockets.close(resolve));
        await close(upstreamServer);
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
