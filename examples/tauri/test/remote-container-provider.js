// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const { TauriContainerConnectionProvider } = require('@theia/dev-container/lib/tauri-node/tauri-container-connection-provider');
const { TauriDevContainerClaimContribution } = require('@theia/dev-container/lib/tauri-main/tauri-dev-container-claim-module');

async function run() {
    const provider = new TauriContainerConnectionProvider();
    const calls = [];
    const token = 'a'.repeat(64);
    provider.logger = { error: () => {}, debug: () => {} };
    provider.remoteSetup = { setup: async ({ connection }) => {
        connection.remotePort = 3333;
        return { applicationDirectory: '/app/lib', nodeDirectory: '/app/node', gatewayToken: token };
    } };
    provider.remoteConnectionService = { register: () => {
        calls.push('connection-register');
        return { dispose: () => calls.push('connection-dispose') };
    } };
    provider.serverProvider = { getProxyServer: async (_forward, hostname) => {
        assert.equal(hostname, '127.0.0.1');
        return { address: () => ({ port: 41234 }), close: () => calls.push('server-close') };
    } };
    provider.gateway = { register: (id, port, received) => {
        assert.match(id, /^[0-9a-f]{32}$/);
        assert.equal(port, 41234);
        assert.equal(received, token);
        calls.push('gateway-register');
        return { dispose: () => calls.push('gateway-dispose') };
    } };
    const docker = { getEvents: async () => ({ on: () => {}, destroy: () => {} }) };
    const container = { id: 'test-container' };
    const result = await provider.setupRemoteConnection(container, docker, { shutdownAction: 'none' }, undefined, () => {});
    assert.match(result.sessionId, /^[0-9a-f]{32}$/);
    assert.equal(result.localPort, 41234);
    assert.deepEqual(calls, ['connection-register', 'gateway-register']);
    await result.remote.dispose();
    assert.deepEqual(calls.slice(2), ['server-close', 'connection-dispose', 'gateway-dispose']);
    assert.throws(() => provider.registerRemoteSession(result.remote, 41234, {}), /gateway token/);

    const claim = new TauriDevContainerClaimContribution();
    assert.equal(claim.claimsLaunch(['--attach-container=abc']), true);
    assert.equal(claim.claimsLaunch(['--attach-container', 'abc']), true);
    assert.equal(claim.claimsLaunch(['--attach-container', '--other']), false);
    assert.equal(claim.claimsLaunch(['--workspace', '/tmp/example']), false);
    console.log('Tauri dev-container gateway registration passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
