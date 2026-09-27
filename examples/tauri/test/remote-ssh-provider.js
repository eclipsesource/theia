// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const { TauriRemoteSSHConnectionProvider } = require('@theia/remote/lib/tauri-node/tauri-remote-ssh-connection-provider');
const { TauriRemoteStatusService } = require('@theia/remote/lib/tauri-node/tauri-remote-status-service');

function createProvider(gatewayToken) {
    const calls = [];
    let disconnect;
    let fail;
    const remote = {
        id: 'ssh-connection',
        name: 'example',
        type: 'SSH',
        localPort: 0,
        forwardOut: () => calls.push('forward'),
        onDidDisconnect: listener => { disconnect = listener; },
        dispose: () => { calls.push('remote-dispose'); disconnect?.(); }
    };
    const provider = new TauriRemoteSSHConnectionProvider();
    provider.establishSSHConnection = async () => remote;
    provider.messageService = { showProgress: async () => ({ report: () => {}, cancel: () => calls.push('progress-cancel') }) };
    provider.remoteSetup = { setup: async options => {
        assert.equal(options.connection, remote);
        return { gatewayToken };
    } };
    provider.serverProvider = { getProxyServer: async (_forward, hostname) => {
        assert.equal(hostname, '127.0.0.1');
        return { address: () => ({ port: 41234 }), close: () => calls.push('server-close') };
    } };
    provider.gateway = { register: (id, port, token, onDidFail) => {
        assert.match(id, /^[0-9a-f]{32}$/);
        assert.equal(port, 41234);
        assert.equal(token, gatewayToken);
        fail = onDidFail;
        calls.push('gateway-register');
        return { dispose: () => calls.push('gateway-dispose') };
    } };
    provider.remoteConnectionService = { register: connection => {
        assert.equal(connection, remote);
        calls.push('connection-register');
        return { dispose: () => calls.push('connection-dispose') };
    } };
    return { provider, remote, calls, fail: () => fail?.() };
}

async function run() {
    const valid = createProvider('a'.repeat(64));
    const id = await valid.provider.establishConnection({ host: 'example', user: 'test' });
    assert.match(id, /^[0-9a-f]{32}$/);
    assert.equal(valid.remote.localPort, 41234);
    assert.deepEqual(valid.calls.slice(0, 3), ['gateway-register', 'connection-register', 'progress-cancel']);
    const status = new TauriRemoteStatusService();
    status.gateway = { getSessionPort: sessionId => sessionId === id ? 41234 : undefined };
    status.remoteConnectionService = { getConnectionFromPort: port => port === 41234 ? valid.remote : undefined };
    assert.deepEqual(await status.getStatus(id), { alive: true, name: 'example', type: 'SSH' });
    assert.deepEqual(await status.getStatus('unknown'), { alive: false });
    await status.connectionClosed(id);
    assert.deepEqual(valid.calls.slice(3), ['remote-dispose', 'gateway-dispose', 'server-close', 'connection-dispose']);

    const unexpected = createProvider('b'.repeat(64));
    await unexpected.provider.establishConnection({ host: 'example', user: 'test' });
    unexpected.fail();
    assert.deepEqual(unexpected.calls.slice(3), ['gateway-dispose', 'server-close', 'connection-dispose', 'remote-dispose']);

    const missing = createProvider(undefined);
    await assert.rejects(missing.provider.establishConnection({ host: 'example', user: 'test' }), /gateway token/);
    assert.deepEqual(missing.calls, ['remote-dispose', 'progress-cancel']);
    console.log('Tauri SSH gateway registration passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
