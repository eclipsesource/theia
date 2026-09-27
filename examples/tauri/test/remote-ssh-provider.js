// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const { TauriRemoteSSHConnectionProvider } = require('@theia/remote/lib/tauri-node/tauri-remote-ssh-connection-provider');

function createProvider(gatewayToken) {
    const calls = [];
    let disconnect;
    const remote = {
        id: 'ssh-connection',
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
    provider.gateway = { register: (id, port, token) => {
        assert.match(id, /^[0-9a-f]{32}$/);
        assert.equal(port, 41234);
        assert.equal(token, gatewayToken);
        calls.push('gateway-register');
        return { dispose: () => calls.push('gateway-dispose') };
    } };
    provider.remoteConnectionService = { register: connection => {
        assert.equal(connection, remote);
        calls.push('connection-register');
        return { dispose: () => calls.push('connection-dispose') };
    } };
    return { provider, remote, calls, disconnect: () => disconnect?.() };
}

async function run() {
    const valid = createProvider('a'.repeat(64));
    const id = await valid.provider.establishConnection({ host: 'example', user: 'test' });
    assert.match(id, /^[0-9a-f]{32}$/);
    assert.equal(valid.remote.localPort, 41234);
    assert.deepEqual(valid.calls.slice(0, 3), ['gateway-register', 'connection-register', 'progress-cancel']);
    valid.disconnect();
    assert.deepEqual(valid.calls.slice(3), ['gateway-dispose', 'server-close', 'connection-dispose']);

    const missing = createProvider(undefined);
    await assert.rejects(missing.provider.establishConnection({ host: 'example', user: 'test' }), /gateway token/);
    assert.deepEqual(missing.calls, ['remote-dispose', 'progress-cancel']);
    console.log('Tauri SSH gateway registration passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
