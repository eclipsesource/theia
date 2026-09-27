// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as crypto from 'crypto';
import * as net from 'net';
import { injectable, inject } from '@theia/core/shared/inversify';
import { TauriRemoteGateway } from '@theia/core/lib/tauri-node/messaging/tauri-remote-gateway';
import { RemoteSSHConnectionProviderOptions } from '../electron-common/remote-ssh-connection-provider';
import { RemoteSSHConnectionProviderImpl } from '../electron-node/ssh/remote-ssh-connection-provider';
import { RemoteStatusReport } from '../electron-node/remote-types';

@injectable()
export class TauriRemoteSSHConnectionProvider extends RemoteSSHConnectionProviderImpl {
    @inject(TauriRemoteGateway)
    protected readonly gateway: TauriRemoteGateway;

    override async establishConnection(options: RemoteSSHConnectionProviderOptions): Promise<string> {
        const progress = await this.messageService.showProgress({ text: 'Remote SSH' });
        const report: RemoteStatusReport = message => progress.report({ message });
        report('Connecting to remote system...');
        let remote;
        let server: net.Server | undefined;
        let registration: { dispose(): void } | undefined;
        let gatewayRegistration: { dispose(): void } | undefined;
        try {
            const connection = await this.establishSSHConnection(options.host, options.user, options.customConfigFile);
            remote = connection;
            const result = await this.remoteSetup.setup({
                connection,
                report,
                nodeDownloadTemplate: options.nodeDownloadTemplate
            });
            if (!result.gatewayToken) {
                throw new Error('Tauri remote setup did not return a gateway token');
            }
            server = await this.serverProvider.getProxyServer(socket => connection.forwardOut(socket), '127.0.0.1');
            const localPort = (server.address() as net.AddressInfo).port;
            const sessionId = crypto.randomBytes(16).toString('hex');
            gatewayRegistration = this.gateway.register(sessionId, localPort, result.gatewayToken);
            registration = this.remoteConnectionService.register(connection);
            connection.localPort = localPort;
            connection.onDidDisconnect(() => {
                gatewayRegistration?.dispose();
                server?.close();
                registration?.dispose();
            });
            return sessionId;
        } catch (error) {
            gatewayRegistration?.dispose();
            server?.close();
            registration?.dispose();
            remote?.dispose();
            throw error;
        } finally {
            progress.cancel();
        }
    }
}
