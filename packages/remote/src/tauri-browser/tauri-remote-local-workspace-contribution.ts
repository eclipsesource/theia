// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { getTauriRemoteSessionId, tauriRemoteSessionParam } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { StopReason } from '@theia/core/lib/common/frontend-application-state';
import { RemoteLocalWorkspaceContribution } from '../electron-browser/remote-local-workspace-contribution';

@injectable()
export class TauriRemoteLocalWorkspaceContribution extends RemoteLocalWorkspaceContribution {
    protected override reloadWindow(workspacePath: string): void {
        const id = getTauriRemoteSessionId(window.location.href);
        this.windowService.isSafeToShutDown(StopReason.Reload).then(async isSafe => {
            if (!isSafe) {
                return;
            }
            if (id) {
                await this.remoteStatusService.connectionClosed(id);
            }
            this.windowService.setSafeToShutDown();
            this.windowService.reload({ hash: encodeURI(workspacePath), search: {} });
        }).catch(error => this.logger.error(error));
    }

    protected override getModifiedUrl(): URL {
        const url = new URL(window.location.href);
        url.searchParams.delete(tauriRemoteSessionParam);
        return url;
    }
}
