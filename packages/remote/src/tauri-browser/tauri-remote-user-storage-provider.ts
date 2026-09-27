// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { getTauriRemoteSessionId } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { RemoteUserStorageContribution } from '../electron-browser/remote-user-storage-provider';

@injectable()
export class TauriRemoteUserStorageContribution extends RemoteUserStorageContribution {
    protected override init(): void {
        const id = getTauriRemoteSessionId(window.location.href);
        if (id) {
            this.remoteStatusService.getStatus(id).then(
                status => this.isRemoteConnection.resolve(status.alive),
                error => this.isRemoteConnection.reject(error)
            );
        } else {
            this.isRemoteConnection.resolve(false);
        }
    }
}
