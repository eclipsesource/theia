// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

exports.activate = context => {
    const layout = require('native-keymap').getCurrentKeyboardLayout();
    console.log(`TAURI_NATIVE_PROBE_KEYMAP ${layout?.layout ?? layout?.name ?? layout?.localizedName ?? 'unknown'}`);

    const terminal = require('node-pty').spawn(process.execPath, ['-e', 'process.stdout.write("PTY_OK")'], {
        name: 'xterm-color',
        cols: 80,
        rows: 24
    });
    let output = '';
    let exited = false;
    terminal.onData(data => {
        output += data;
        if (output.includes('PTY_OK')) {
            console.log('TAURI_NATIVE_PROBE_PTY_OK');
            output = '';
        }
    });
    terminal.onExit(() => exited = true);
    context.subscriptions.push({ dispose: () => { if (!exited) { terminal.kill(); } } });
    return {};
};
