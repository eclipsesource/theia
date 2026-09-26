// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

function report(event) {
    console.log(`TAURI_HEADLESS_PROBE_${event.toUpperCase()}`);
}

exports.start = () => {
    report('started');
    return {};
};

exports.stop = () => report('stopped');
