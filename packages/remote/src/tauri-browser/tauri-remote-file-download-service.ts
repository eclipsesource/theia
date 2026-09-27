// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { getTauriRemoteSessionId } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { FileDownloadServiceImpl } from '@theia/filesystem/lib/browser/download/file-download-service';

@injectable()
export class TauriRemoteFileDownloadService extends FileDownloadServiceImpl {
    protected override filesUrl(): string {
        const sessionId = getTauriRemoteSessionId(window.location.href);
        return sessionId
            ? new Endpoint({ path: `tauri-remote/${sessionId}/files` }).getRestUrl().toString()
            : super.filesUrl();
    }
}
