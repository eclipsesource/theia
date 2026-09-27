// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const assert = require('assert').strict;
const { getTauriRemoteSessionId, getTauriRemoteServicePath } = require('@theia/core/lib/tauri-common/tauri-remote-session');

const origin = 'http://127.0.0.1:3000/';
const id = 'a'.repeat(32);
assert.equal(getTauriRemoteSessionId(origin), undefined);
assert.equal(getTauriRemoteSessionId(`${origin}?remoteSession=${id}`), id);
assert.equal(getTauriRemoteServicePath(`${origin}?remoteSession=${id}`), `/tauri-remote/${id}/services`);
assert.throws(() => getTauriRemoteServicePath(origin), /Missing Tauri remote session ID/);
assert.throws(() => getTauriRemoteSessionId(`${origin}?remoteSession=../tauri-services`), /Invalid Tauri remote session ID/);
console.log('Tauri remote service path passed');
