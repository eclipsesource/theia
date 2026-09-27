// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const net = require('net');
const { Emitter } = require('@theia/core');
const { TauriRemotePortForwardingProvider } = require('@theia/remote/lib/tauri-node/tauri-remote-port-forwarding-provider');

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
        socket.on('data', chunk => { value += chunk; });
        socket.once('end', () => resolve(value));
        socket.once('error', reject);
    });
}

async function run() {
    const id = 'a'.repeat(32);
    const proxyPort = 43210;
    const forwardedPort = await freePort();
    const disconnect = new Emitter();
    const connection = {
        localPort: proxyPort,
        onDidDisconnect: disconnect.event,
        forwardOut: (socket, port) => socket.end(`remote-${port}`)
    };
    const provider = new TauriRemotePortForwardingProvider();
    provider.gateway = { getSessionPort: session => session === id ? proxyPort : undefined };
    provider.connectionService = { getConnectionFromPort: port => port === proxyPort ? connection : undefined };
    try {
        await assert.rejects(provider.forwardPort('b'.repeat(32), { port: forwardedPort }), /no longer connected/);
        await assert.rejects(provider.forwardPort(id, { port: forwardedPort, address: '0.0.0.0' }), /local loopback/);
        await provider.forwardPort(id, { port: forwardedPort });
        assert.equal(await readPort(forwardedPort), `remote-${forwardedPort}`);
        assert.deepEqual(await provider.getForwardedPorts(), [{ port: forwardedPort, address: '127.0.0.1' }]);
        disconnect.fire();
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.deepEqual(await provider.getForwardedPorts(), []);
        await assert.rejects(readPort(forwardedPort), { code: 'ECONNREFUSED' });
        console.log('Tauri remote port forwarding and cleanup passed');
    } finally {
        await provider.portRemoved({ port: forwardedPort });
        disconnect.dispose();
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
