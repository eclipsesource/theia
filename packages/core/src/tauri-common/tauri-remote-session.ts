// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const tauriRemoteSessionParam = 'remoteSession';

export function getTauriRemoteSessionId(href: string): string | undefined {
    const id = new URL(href).searchParams.get(tauriRemoteSessionParam);
    if (id && !/^[0-9a-f]{32}$/.test(id)) {
        throw new Error('Invalid Tauri remote session ID');
    }
    return id || undefined;
}

export function getTauriRemoteServicePath(href: string): string {
    const id = getTauriRemoteSessionId(href);
    if (!id) {
        throw new Error('Missing Tauri remote session ID');
    }
    return `/tauri-remote/${id}/services`;
}
