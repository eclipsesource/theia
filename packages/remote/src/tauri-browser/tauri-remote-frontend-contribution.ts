// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { StopReason } from '@theia/core/lib/common/frontend-application-state';
import { DEFAULT_WINDOW_HASH } from '@theia/core/lib/common/window';
import { getTauriRemoteSessionId } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { RemoteFrontendContribution } from '../electron-browser/remote-frontend-contribution';

@injectable()
export class TauriRemoteFrontendContribution extends RemoteFrontendContribution {
    override async configure(): Promise<void> {
        const id = getTauriRemoteSessionId(window.location.href);
        await this.setStatusBar(id ? await this.remoteStatusService.getStatus(id) : { alive: false });
    }

    protected override async disconnectRemote(): Promise<void> {
        const id = getTauriRemoteSessionId(window.location.href);
        if (!id || !await this.windowService.isSafeToShutDown(StopReason.Reload)) {
            return;
        }
        await this.remoteStatusService.connectionClosed(id);
        this.windowService.setSafeToShutDown();
        this.windowService.reload({ search: {}, hash: DEFAULT_WINDOW_HASH });
    }
}
