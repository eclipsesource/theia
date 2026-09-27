// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { StopReason } from '@theia/core/lib/common/frontend-application-state';
import { getTauriRemoteSessionId, tauriRemoteSessionParam } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { RemoteStatusService } from '@theia/remote/lib/electron-common/remote-status-service';
import { ContainerConnectionContribution } from '../electron-browser/container-connection-contribution';

@injectable()
export class TauriContainerConnectionContribution extends ContainerConnectionContribution {
    @inject(RemoteStatusService)
    protected readonly remoteStatusService: RemoteStatusService;

    protected override isRemoteSession(): boolean {
        return getTauriRemoteSessionId(window.location.href) !== undefined;
    }

    protected override openRemote(id: string, _newWindow: boolean, workspace?: string): void {
        const previous = getTauriRemoteSessionId(window.location.href);
        this.windowService.isSafeToShutDown(StopReason.Reload).then(async isSafe => {
            if (!isSafe) {
                await this.remoteStatusService.connectionClosed(id);
                return;
            }
            if (previous) {
                await this.remoteStatusService.connectionClosed(previous);
            }
            this.windowService.setSafeToShutDown();
            this.windowService.reload({ search: { [tauriRemoteSessionParam]: id }, hash: workspace });
        }).catch(error => {
            this.remoteStatusService.connectionClosed(id).catch(() => undefined);
            this.messageService.error(`Could not open container session: ${error}`);
        });
    }
}
