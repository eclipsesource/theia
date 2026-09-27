// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const { execFileSync } = require('child_process');
const { createHash, randomBytes } = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const Docker = require('dockerode');
const express = require('express');
const WebSocket = require('ws');
const { TauriRemoteGateway } = require('@theia/core/lib/tauri-node/messaging/tauri-remote-gateway');
const { TauriRemoteSetupService } = require('@theia/remote/lib/tauri-node/tauri-remote-setup-service');
const { RemoteNodeSetupService } = require('@theia/remote/lib/electron-node/setup/remote-node-setup-service');
const { RemotePosixScriptStrategy, RemoteWindowsScriptStrategy, RemoteSetupScriptService } = require('@theia/remote/lib/electron-node/setup/remote-setup-script-service');
const { RemoteConnectionService } = require('@theia/remote/lib/electron-node/remote-connection-service');
const { RemoteProxyServerProvider } = require('@theia/remote/lib/electron-node/remote-proxy-server-provider');
const { TauriContainerConnectionProvider } = require('@theia/dev-container/lib/tauri-node/tauri-container-connection-provider');
const { TauriRemotePortForwardingProvider } = require('@theia/remote/lib/tauri-node/tauri-remote-port-forwarding-provider');

const repo = path.resolve(__dirname, '../../..');
const nodePrefix = process.env.THEIA_TEST_NODE_PREFIX || path.dirname(path.dirname(process.execPath));

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

function readPort(port) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1');
        let value = '';
        const timer = setTimeout(() => { socket.destroy(); reject(new Error(`Forwarded port timed out after ${JSON.stringify(value)}`)); }, 10000);
        socket.once('connect', () => socket.write('ping'));
        socket.on('data', chunk => { value += chunk; });
        socket.once('end', () => { clearTimeout(timer); resolve(value); });
        socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
}

function connect(port, id) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/tauri-remote/${id}/services`, {
            headers: { Origin: `http://127.0.0.1:${port}`, Cookie: 'local=valid' }
        });
        const timer = setTimeout(() => { socket.terminate(); reject(new Error('Gateway handshake timed out')); }, 15000);
        socket.once('open', () => { clearTimeout(timer); resolve(socket); });
        socket.once('unexpected-response', (_request, response) => {
            clearTimeout(timer);
            response.resume();
            reject(new Error(`Gateway rejected with ${response.statusCode}`));
        });
        socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
}

function requestHttp(port, path, options = {}) {
    return new Promise((resolve, reject) => {
        const request = http.request({ hostname: '127.0.0.1', port, path, method: options.method || 'GET',
            headers: { Cookie: 'local=valid', ...options.headers } }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks) }));
        });
        request.once('error', reject);
        request.end(options.body);
    });
}

async function run() {
    if (Number(process.versions.node.split('.')[0]) < 24 && !process.env.THEIA_TEST_NODE_PREFIX) {
        throw new Error('This check requires Node 24 or THEIA_TEST_NODE_PREFIX pointing to a Node 24 installation');
    }
    if (process.platform !== 'linux' || !fs.existsSync(path.join(nodePrefix, 'bin/node'))) {
        throw new Error('This check requires Linux and a Node distribution directory');
    }
    const remoteSetup = new TauriRemoteSetupService();
    remoteSetup.applicationPackage = { pck: require('../package.json') };
    const remoteRoot = `/root/.${remoteSetup.getRemoteAppName()}`;
    const nodeSetup = new RemoteNodeSetupService();
    remoteSetup.nodeSetupService = nodeSetup;
    const remoteNodeDirectory = nodeSetup.getNodeDirectoryName({ os: 'Linux', arch: process.arch });
    const docker = new Docker();
    const container = await docker.createContainer({
        Image: 'debian:trixie-slim', Cmd: ['sleep', '120'], Env: ['NODE_PATH=/repo/node_modules', 'THEIA_CONFIG_DIR=/tmp/tauri-remote-check'],
        HostConfig: { Binds: [
            `${repo}:/repo:ro`,
            `${repo}/examples/tauri/lib:${remoteRoot}/lib:ro`,
            `${repo}/examples/tauri/package.json:${remoteRoot}/package.json:ro`,
            `${nodePrefix}:${remoteRoot}/${remoteNodeDirectory}:ro`
        ] }
    });
    await container.start();
    const scriptService = new RemoteSetupScriptService();
    scriptService.posixStrategy = new RemotePosixScriptStrategy();
    scriptService.windowsStrategy = new RemoteWindowsScriptStrategy();
    remoteSetup.scriptService = scriptService;
    remoteSetup.cliContributions = { getContributions: () => [] };
    const gateway = new TauriRemoteGateway();
    gateway.validator = { allowWsUpgrade: request => request.headers.origin === `http://127.0.0.1:${request.socket.localPort}` && request.headers.cookie === 'local=valid' };
    const localApp = express();
    localApp.use((request, response, next) => request.headers.cookie === 'local=valid' &&
        (!request.headers.origin || request.headers.origin === `http://127.0.0.1:${request.socket.localPort}`)
        ? next() : response.sendStatus(403));
    gateway.configure(localApp);
    const localServer = http.createServer(localApp);
    gateway.onStart(localServer);
    const localPort = await new Promise(resolve => localServer.listen(0, '127.0.0.1', () => resolve(localServer.address().port)));
    const provider = new TauriContainerConnectionProvider();
    provider.logger = { debug: () => {}, error: (...args) => console.error(...args) };
    provider.remoteSetup = remoteSetup;
    provider.remoteConnectionService = new RemoteConnectionService();
    provider.serverProvider = new RemoteProxyServerProvider();
    provider.gateway = gateway;
    const forwarding = new TauriRemotePortForwardingProvider();
    forwarding.gateway = gateway;
    forwarding.connectionService = provider.remoteConnectionService;
    let remote;
    let socket;
    let forwardedPort;
    try {
        const result = await provider.setupRemoteConnection(container, docker, {
            name: 'disposable', shutdownAction: 'none'
        }, undefined, () => {});
        remote = result.remote;
        assert.match(result.sessionId, /^[0-9a-f]{32}$/);
        assert.equal(gateway.getSessionPort(result.sessionId), result.localPort);
        socket = await connect(localPort, result.sessionId);
        console.log('docker_gateway_websocket=passed');
        socket.close();
        await new Promise(resolve => socket.once('close', resolve));
        const node = `${remoteRoot}/${remoteNodeDirectory}/bin/node`;
        const transferBody = randomBytes(8 * 1024 * 1024);
        const transferHash = createHash('sha256').update(transferBody).digest('hex');
        execFileSync('docker', ['exec', container.id, node, '-e',
            "require('fs').writeFileSync('/tmp/theia-large-download.bin', Buffer.alloc(8 * 1024 * 1024, 0x5a))"]);
        const filesPath = `/tauri-remote/${result.sessionId}/files`;
        const prepared = await requestHttp(localPort, `${filesPath}/?uri=file:///tmp/theia-large-download.bin`);
        assert.equal(prepared.status, 200);
        const downloadId = JSON.parse(prepared.body.toString()).id;
        const downloaded = await requestHttp(localPort, `${filesPath}/download/?id=${encodeURIComponent(downloadId)}`);
        assert.equal(downloaded.status, 200);
        assert.equal(downloaded.body.length, transferBody.length);
        assert.equal(downloaded.body.compare(Buffer.alloc(transferBody.length, 0x5a)), 0);
        console.log('docker_large_download=passed');
        const boundary = `theia-${randomBytes(12).toString('hex')}`;
        const multipart = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="uri"\r\n\r\nfile:///tmp/theia-large-upload.bin\r\n` +
                `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.bin"\r\n` +
                'Content-Type: application/octet-stream\r\n\r\n'),
            transferBody,
            Buffer.from(`\r\n--${boundary}--\r\n`)
        ]);
        const uploaded = await requestHttp(localPort, `/tauri-remote/${result.sessionId}/file-upload`, {
            method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: multipart
        });
        assert.equal(uploaded.status, 200);
        assert.equal(uploaded.body.toString(), '/tmp/theia-large-upload.bin');
        const remoteHash = execFileSync('docker', ['exec', container.id, 'sha256sum', '/tmp/theia-large-upload.bin'])
            .toString().split(' ')[0];
        assert.equal(remoteHash, transferHash);
        console.log('docker_large_upload=passed');
        forwardedPort = await freePort();
        execFileSync('docker', ['exec', '-d', container.id, node, '-e',
            `require('net').createServer(socket => socket.once('data', () => socket.end('remote-port-ok'))).listen(${forwardedPort}, '127.0.0.1')`]);
        let remoteReady = false;
        for (let attempt = 0; attempt < 20 && !remoteReady; attempt++) {
            try {
                execFileSync('docker', ['exec', container.id, node, '-e',
                    `require('net').connect(${forwardedPort}, '127.0.0.1').on('connect', function () { this.end(); }).on('error', () => process.exit(1))`]);
                remoteReady = true;
            } catch {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        assert.equal(remoteReady, true, 'remote TCP service did not start');
        await forwarding.forwardPort(result.sessionId, { port: forwardedPort, address: '127.0.0.1' });
        assert.equal(await readPort(forwardedPort), 'remote-port-ok');
        console.log('docker_forwarded_port=passed');
        await remote.dispose();
        remote = undefined;
        assert.equal(gateway.getSessionPort(result.sessionId), undefined);
        assert.deepEqual(await forwarding.getForwardedPorts(), []);
        await assert.rejects(readPort(forwardedPort), { code: 'ECONNREFUSED' });
        console.log('docker_gateway_cleanup=passed');
    } finally {
        socket?.terminate();
        if (forwardedPort) {
            await forwarding.portRemoved({ port: forwardedPort });
        }
        await remote?.dispose().catch(() => {});
        gateway.onStop();
        await new Promise(resolve => localServer.close(resolve));
        await container.stop().catch(() => {});
        await container.remove({ force: true });
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
