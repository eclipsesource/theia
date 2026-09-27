// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { getTauriRemoteSessionId } from '@theia/core/lib/tauri-common/tauri-remote-session';

/** Keep remote extension file requests on the authenticated local window origin. */
export function tauriRemoteResourcePath(path: string): string {
    if (environment.tauri.is()) {
        const sessionId = getTauriRemoteSessionId(window.location.href);
        if (sessionId) {
            return `tauri-remote/${sessionId}/${path}`;
        }
    }
    return path;
}
