// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { createServer, Server, Socket } from 'net';
import { Disposable } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TauriRemoteGateway } from '@theia/core/lib/tauri-node/messaging/tauri-remote-gateway';
import { ForwardedPort, RemotePortForwardingProvider } from '../electron-common/remote-port-forwarding-provider';
import { RemoteConnectionService } from '../electron-node/remote-connection-service';

interface ForwardInfo {
    port: ForwardedPort;
    server: Server;
    sockets: Set<Socket>;
    disconnect: Disposable;
}

/** Exposes a remote loopback service only on the owning Tauri backend's loopback address. */
@injectable()
export class TauriRemotePortForwardingProvider implements RemotePortForwardingProvider {
    @inject(TauriRemoteGateway)
    protected readonly gateway: TauriRemoteGateway;

    @inject(RemoteConnectionService)
    protected readonly connectionService: RemoteConnectionService;

    protected static readonly forwarded = new Map<number, ForwardInfo>();

    async forwardPort(sessionId: number | string, requested: ForwardedPort): Promise<void> {
        if (typeof sessionId !== 'string' || !/^[0-9a-f]{32}$/.test(sessionId)) {
            throw new Error('A Tauri remote session is required to forward a port');
        }
        if (!Number.isInteger(requested.port) || requested.port < 1 || requested.port > 65535) {
            throw new Error('Invalid port to forward');
        }
        if (requested.address && requested.address !== '127.0.0.1' && requested.address !== 'localhost') {
            throw new Error('Tauri port forwarding only supports local loopback');
        }
        if (TauriRemotePortForwardingProvider.forwarded.has(requested.port)) {
            throw new Error(`Port ${requested.port} is already forwarded`);
        }
        const proxyPort = this.gateway.getSessionPort(sessionId);
        const connection = proxyPort === undefined ? undefined : this.connectionService.getConnectionFromPort(proxyPort);
        if (proxyPort === undefined || !connection) {
            throw new Error('The Tauri remote session is no longer connected');
        }

        const sockets = new Set<Socket>();
        const server = createServer(socket => {
            sockets.add(socket);
            socket.once('close', () => sockets.delete(socket));
            connection.forwardOut(socket, requested.port);
        });
        try {
            await new Promise<void>((resolve, reject) => {
                server.once('error', reject);
                server.listen(requested.port, '127.0.0.1', () => {
                    server.off('error', reject);
                    resolve();
                });
            });
            if (this.gateway.getSessionPort(sessionId) !== proxyPort || this.connectionService.getConnectionFromPort(proxyPort) !== connection) {
                throw new Error('The Tauri remote session disconnected during port forwarding');
            }
            const disconnect = connection.onDidDisconnect(() => { this.portRemoved(requested).catch(() => undefined); });
            TauriRemotePortForwardingProvider.forwarded.set(requested.port, {
                port: { ...requested, address: '127.0.0.1' }, server, sockets, disconnect
            });
        } catch (error) {
            if (server.listening) {
                server.close();
            }
            throw error;
        }
    }

    async portRemoved(port: ForwardedPort): Promise<void> {
        const info = TauriRemotePortForwardingProvider.forwarded.get(port.port);
        if (info) {
            TauriRemotePortForwardingProvider.forwarded.delete(port.port);
            info.disconnect.dispose();
            for (const socket of info.sockets) {
                socket.destroy();
            }
            await new Promise<void>(resolve => info.server.close(() => resolve()));
        }
    }

    async getForwardedPorts(): Promise<ForwardedPort[]> {
        return Array.from(TauriRemotePortForwardingProvider.forwarded.values(), info => info.port);
    }
}
