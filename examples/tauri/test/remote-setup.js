// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const path = require('path');
const { RemoteSetupService } = require('@theia/remote/lib/electron-node/setup/remote-setup-service');
const { TauriRemoteSetupService } = require('@theia/remote/lib/tauri-node/tauri-remote-setup-service');

function createService(type) {
    const service = new type();
    service.detectRemotePlatform = async () => ({ os: 'Linux', arch: 'x64' });
    service.getRemoteHomeDirectory = async () => '/home/test';
    service.mkdirRemote = async () => {};
    service.dirExistsRemote = async () => true;
    service.getRemoteAppName = () => 'test-app';
    service.scriptService = { joinPath: (_platform, ...parts) => path.posix.join(...parts) };
    service.nodeSetupService = { getNodeFileName: () => 'node.tar', getNodeDirectoryName: () => 'node' };
    service.cliContributions = { getContributions: () => [] };
    return service;
}

async function setup(service) {
    const calls = [];
    const connection = {
        remotePort: 0,
        execPartial: async (command, tester, args, options) => {
            calls.push({ command, args, options });
            const hostname = args.find(arg => arg.startsWith('--hostname=')).split('=')[1];
            const output = `Theia app listening on http://${hostname}:41234.`;
            assert.equal(tester(output), true);
            return { stdout: output, stderr: '' };
        }
    };
    const result = await service.setup({ connection, report: () => {} });
    assert.equal(connection.remotePort, 41234);
    assert.equal(calls.length, 1);
    return { result, call: calls[0] };
}

async function run() {
    const tauri = createService(TauriRemoteSetupService);
    const first = await setup(tauri);
    const second = await setup(tauri);
    for (const { result, call } of [first, second]) {
        assert.match(result.gatewayToken, /^[0-9a-f]{64}$/);
        assert.equal(call.options.env.THEIA_TAURI_REMOTE_TOKEN, result.gatewayToken);
        assert.ok(call.args[0].endsWith('/remote-main.js'));
        assert.ok(call.args.includes('--hostname=127.0.0.1'));
        assert.equal(call.command.includes(result.gatewayToken), false);
        assert.equal(call.args.join(' ').includes(result.gatewayToken), false);
    }
    assert.notEqual(first.result.gatewayToken, second.result.gatewayToken);

    const electron = await setup(createService(RemoteSetupService));
    assert.ok(electron.call.args[0].endsWith('/main.js'));
    assert.ok(electron.call.args.includes('--hostname=0.0.0.0'));
    assert.equal(electron.call.options, undefined);
    assert.equal(electron.result.gatewayToken, undefined);
    await assert.rejects(
        tauri.startApplication({}, { os: 'Linux' }, '/', '/node', [], 'invalid'),
        /Invalid Tauri remote gateway token/
    );
    console.log('Tauri remote setup handoff passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
