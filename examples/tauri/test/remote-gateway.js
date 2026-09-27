// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const { randomBytes } = require('crypto');
const http = require('http');
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

async function run() {
    const token = randomBytes(32).toString('hex');
    const id = randomBytes(16).toString('hex');
    const upstreamServer = http.createServer();
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
    const localServer = http.createServer((_request, response) => response.writeHead(404).end());
    const gateway = new TauriRemoteGateway();
    Object.defineProperty(gateway, 'validator', {
        value: { allowWsUpgrade: request => request.headers.origin === `http://127.0.0.1:${request.socket.localPort}` && request.headers.cookie === 'local=valid' }
    });
    gateway.onStart(localServer);
    const localPort = await listen(localServer);
    const allowed = { Origin: `http://127.0.0.1:${localPort}`, Cookie: 'local=valid' };
    let client;
    try {
        assert.throws(() => gateway.register('invalid', upstreamPort, token), /Invalid/);
        const registration = gateway.register(id, upstreamPort, token);
        assert.throws(() => gateway.register(id, upstreamPort, token), /already exists/);
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
