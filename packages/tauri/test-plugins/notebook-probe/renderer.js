// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

import { formatProbeOutput } from './renderer-helper.js';

export function activate() {
    return {
        async renderOutputItem(output, element) {
            const outside = await fetch(`${location.origin}/webview/theia-resource/file///etc/hosts`);
            element.textContent = formatProbeOutput(output.text(), globalThis.tauriNotebookPreloadReady, outside.status);
        }
    };
}
