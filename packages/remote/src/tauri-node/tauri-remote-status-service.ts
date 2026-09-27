// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { TauriRemoteGateway } from '@theia/core/lib/tauri-node/messaging/tauri-remote-gateway';
import { RemoteStatus } from '../electron-common/remote-status-service';
import { RemoteStatusServiceImpl } from '../electron-node/remote-status-service';

@injectable()
export class TauriRemoteStatusService extends RemoteStatusServiceImpl {
    @inject(TauriRemoteGateway)
    protected readonly gateway: TauriRemoteGateway;

    override getStatus(sessionId: number | string): Promise<RemoteStatus> {
        const port = this.resolvePort(sessionId);
        return port === undefined ? Promise.resolve({ alive: false }) : super.getStatus(port);
    }

    override connectionClosed(sessionId: number | string): Promise<void> {
        const port = this.resolvePort(sessionId);
        return port === undefined ? Promise.resolve() : super.connectionClosed(port);
    }

    protected resolvePort(sessionId: number | string): number | undefined {
        return typeof sessionId === 'string' ? this.gateway.getSessionPort(sessionId) : sessionId;
    }
}
