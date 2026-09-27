// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { StopReason } from '@theia/core/lib/common/frontend-application-state';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { DEFAULT_WINDOW_HASH } from '@theia/core/lib/common/window';
import { getTauriRemoteSessionId, tauriRemoteSessionParam } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { RemoteStatusService } from '../electron-common/remote-status-service';
import { RemoteSSHCommands, RemoteSSHContribution } from '../electron-browser/remote-ssh-contribution';
import { RemoteRegistry } from '../electron-browser/remote-registry-contribution';

@injectable()
export class TauriRemoteSSHContribution extends RemoteSSHContribution {
    protected static readonly sshHostParam = 'tauriSshHost';
    protected static readonly sshUserParam = 'tauriSshUser';

    @inject(RemoteStatusService)
    protected readonly remoteStatusService: RemoteStatusService;
    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    override registerRemoteCommands(registry: RemoteRegistry): void {
        registry.registerCommand(RemoteSSHCommands.CONNECT, { execute: () => this.connect(true) });
        registry.registerCommand(RemoteSSHCommands.CONNECT_CURRENT_WINDOW, { execute: () => this.connect(false) });
        registry.registerCommand(RemoteSSHCommands.CONNECT_CURRENT_WINDOW_TO_CONFIG_HOST, { execute: () => this.connectToConfigHost() });
    }

    onStart(): void {
        const url = new URL(window.location.href);
        const host = url.searchParams.get(TauriRemoteSSHContribution.sshHostParam);
        const user = url.searchParams.get(TauriRemoteSSHContribution.sshUserParam);
        if (!host && !user) {
            return;
        }
        url.searchParams.delete(TauriRemoteSSHContribution.sshHostParam);
        url.searchParams.delete(TauriRemoteSSHContribution.sshUserParam);
        window.history.replaceState(undefined, '', url);
        if (!host || !user || getTauriRemoteSessionId(url.toString())) {
            this.messageService.error('Invalid SSH window target');
            return;
        }
        // This contribution participates in startup, so wait without blocking the ready state.
        Promise.all([this.stateService.reachedState('ready'), this.remotePreferences.ready])
            .then(() => this.connectToHost(host, user, false)).catch(error =>
            this.messageService.error(`Could not open SSH connection to remote: ${error.message ?? String(error)}`));
    }

    protected override async connectToHost(host: string, user: string, newWindow: boolean): Promise<void> {
        if (newWindow) {
            await this.windowService.openNewDefaultWindow({
                hash: DEFAULT_WINDOW_HASH,
                search: {
                    [TauriRemoteSSHContribution.sshHostParam]: host,
                    [TauriRemoteSSHContribution.sshUserParam]: user
                }
            });
            return;
        }
        await super.connectToHost(host, user, false);
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
