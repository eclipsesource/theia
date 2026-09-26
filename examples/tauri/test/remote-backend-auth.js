// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const { fork } = require('child_process');
const { randomBytes } = require('crypto');
const fs = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const entrypoint = path.resolve(__dirname, '../lib/backend/remote-main.js');

function startBackend(profile, token) {
    const env = { ...process.env, THEIA_CONFIG_DIR: profile };
    delete env.THEIA_TAURI_TOKEN;
    delete env.THEIA_TAURI_REMOTE_TOKEN;
    if (token) {
        env.THEIA_TAURI_REMOTE_TOKEN = token;
    }
    const child = fork(entrypoint, ['--hostname=127.0.0.1', '--port=0', '--remote'], {
        cwd: path.resolve(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
        stream.on('data', chunk => { output = (output + chunk).slice(-12000); });
    }
    return { child, output: () => output };
}

function waitForStart(child, output) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Remote backend startup timed out\n${output()}`)), 20000);
        child.once('message', address => {
            clearTimeout(timer);
            resolve(address.port);
        });
        child.once('exit', code => {
            clearTimeout(timer);
            reject(new Error(`Remote backend exited ${code} before listening\n${output()}`));
        });
    });
}

function request(port, headers = {}, resource = '/') {
    return new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port, path: resource, headers }, response => {
            response.resume();
            response.once('end', () => resolve(response.statusCode));
        }).once('error', reject);
    });
}

function connect(port, headers = {}, resource = '/tauri-services') {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}${resource}`, { headers });
        const timer = setTimeout(() => { socket.terminate(); reject(new Error('WebSocket handshake timed out')); }, 5000);
        socket.once('open', () => { clearTimeout(timer); socket.close(); resolve('open'); });
        socket.once('unexpected-response', (_request, response) => {
            clearTimeout(timer);
            response.resume();
            resolve(response.statusCode);
        });
        socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
}

async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    await new Promise(resolve => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGTERM');
    });
}

async function run() {
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'theia-tauri-remote-auth-'));
    const token = randomBytes(32).toString('hex');
    try {
        const missing = startBackend(profile);
        try {
            await assert.rejects(waitForStart(missing.child, missing.output), /requires a per-session gateway token/);
        } finally {
            await stop(missing.child);
        }
        const valid = startBackend(profile, token);
        let port;
        try {
            port = await waitForStart(valid.child, valid.output);
            const authorized = { 'X-Theia-Remote-Token': token };
            const wrongToken = { 'X-Theia-Remote-Token': randomBytes(32).toString('hex') };
            assert.equal(await request(port), 403);
            assert.equal(await request(port, {}, '/metrics'), 403);
            assert.equal(await request(port, wrongToken), 403);
            assert.equal(await request(port, authorized), 200);
            assert.equal(await request(port, { ...authorized, Origin: `http://127.0.0.1:${port}` }), 403);
            assert.equal(await connect(port), 403);
            // Engine.IO returns 400 when its allowRequest validator denies an upgrade.
            assert.equal(await connect(port, {}, '/socket.io/?EIO=4&transport=websocket'), 400);
            assert.equal(await connect(port, wrongToken), 403);
            assert.equal(await connect(port, authorized), 'open');
            assert.equal(await connect(port, authorized, '/socket.io/?EIO=4&transport=websocket'), 'open');
            assert.equal(await connect(port, { ...authorized, Origin: `http://127.0.0.1:${port}` }), 403);
            console.log('Tauri remote backend authentication passed');
        } finally {
            await stop(valid.child);
        }
        if (port !== undefined) {
            await assert.rejects(request(port, { 'X-Theia-Remote-Token': token }), { code: 'ECONNREFUSED' });
        }
    } finally {
        await fs.rm(profile, { recursive: true, force: true });
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
