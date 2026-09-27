// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MessageService, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { StopReason } from '@theia/core/lib/common/frontend-application-state';
import { DEFAULT_WINDOW_HASH } from '@theia/core/lib/common/window';
import { getTauriRemoteSessionId } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { RemoteFrontendContribution } from '../electron-browser/remote-frontend-contribution';

@injectable()
export class TauriRemoteFrontendContribution extends RemoteFrontendContribution {
    @inject(RemoteConnectionProvider)
    protected readonly remoteConnectionProvider: ServiceConnectionProvider;
    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;
    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected socketCloses = 0;
    protected recovering = false;

    onStart(): void {
        if (!getTauriRemoteSessionId(window.location.href)) {
            return;
        }
        this.remoteConnectionProvider.onDidSocketOpen(() => this.socketCloses = 0);
        this.remoteConnectionProvider.onDidSocketClose(() => {
            // A normal reload closes one socket. A failed session also rejects the reconnect.
            if (++this.socketCloses >= 2) {
                this.recoverFromFailedSession().catch(() => undefined);
            }
        });
    }

    protected async recoverFromFailedSession(): Promise<void> {
        if (this.recovering || this.stateService.state === 'closing_window') {
            return;
        }
        const id = getTauriRemoteSessionId(window.location.href);
        if (!id || (await this.remoteStatusService.getStatus(id)).alive) {
            return;
        }
        this.recovering = true;
        await this.setStatusBar({ alive: false });
        this.messageService.error(nls.localize('theia/remote/connectionLost', 'Remote connection lost. Returning to the local workbench.'));
        this.windowService.reload({ search: {}, hash: DEFAULT_WINDOW_HASH });
    }

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
