// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { StopReason } from '@theia/core/lib/common/frontend-application-state';
import { getTauriRemoteSessionId, tauriRemoteSessionParam } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { RemoteStatusService } from '../electron-common/remote-status-service';
import { RemoteSSHCommands, RemoteSSHContribution } from '../electron-browser/remote-ssh-contribution';
import { RemoteRegistry } from '../electron-browser/remote-registry-contribution';

@injectable()
export class TauriRemoteSSHContribution extends RemoteSSHContribution {
    @inject(RemoteStatusService)
    protected readonly remoteStatusService: RemoteStatusService;

    override registerRemoteCommands(registry: RemoteRegistry): void {
        registry.registerCommand(RemoteSSHCommands.CONNECT_CURRENT_WINDOW, { execute: () => this.connect(false) });
        registry.registerCommand(RemoteSSHCommands.CONNECT_CURRENT_WINDOW_TO_CONFIG_HOST, { execute: () => this.connectToConfigHost() });
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
            this.messageService.error(`Could not open remote session: ${error}`);
        });
    }
}
