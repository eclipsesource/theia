// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as crypto from 'crypto';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TauriRemoteGateway } from '@theia/core/lib/tauri-node/messaging/tauri-remote-gateway';
import { RemoteSetupResult } from '@theia/remote/lib/electron-node/setup/remote-setup-service';
import { DevContainerConnectionProvider } from '../electron-node/remote-container-connection-provider';
import { RemoteDockerContainerConnection } from '../electron-node/remote-docker-container-connection';

@injectable()
export class TauriContainerConnectionProvider extends DevContainerConnectionProvider {
    @inject(TauriRemoteGateway)
    protected readonly gateway: TauriRemoteGateway;

    protected override getProxyHostname(): string {
        return '127.0.0.1';
    }

    protected override registerRemoteSession(remote: RemoteDockerContainerConnection, port: number, result: RemoteSetupResult): string {
        if (!result.gatewayToken) {
            throw new Error('Tauri container setup did not return a gateway token');
        }
        const id = crypto.randomBytes(16).toString('hex');
        const registration = this.gateway.register(id, port, result.gatewayToken, () => {
            remote.dispose().catch(error => this.logger.error('Could not dispose failed remote container session:', error));
        });
        remote.onDidDisconnect(() => registration.dispose());
        return id;
    }
}
