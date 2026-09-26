// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

export function formatProbeOutput(value, preloadReady, outsideStatus) {
    const preload = preloadReady ? 'PRELOAD_OK' : 'PRELOAD_MISSING';
    const outside = outsideStatus === 404 ? 'OUTSIDE_BLOCKED' : `OUTSIDE_${outsideStatus}`;
    const kernel = globalThis.tauriNotebookKernelPreloadReady ? 'KERNEL_OK' : 'KERNEL_MISSING';
    return `TAURI_RENDERER_${value}_${preload}_${kernel}_${outside}`;
}
