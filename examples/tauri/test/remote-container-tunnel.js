// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

async function run() {
    const server = net.createServer(socket => socket.pipe(socket));
    const port = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
    const helper = spawn(process.execPath, [path.resolve(__dirname, '../lib/backend/dev-container-server.js'), `-target-port=${port}`], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    try {
        const received = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Container tunnel timed out')), 5000);
            helper.stdout.once('data', data => { clearTimeout(timer); resolve(data); });
            helper.once('exit', code => { clearTimeout(timer); reject(new Error(`Container tunnel exited ${code}`)); });
        });
        helper.stdin.write(Buffer.from([0, 1, 2, 255]));
        assert.deepEqual(await received, Buffer.from([0, 1, 2, 255]));
        console.log('Tauri dev-container loopback tunnel passed');
    } finally {
        helper.kill('SIGTERM');
        await new Promise(resolve => server.close(resolve));
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
