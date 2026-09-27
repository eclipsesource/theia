// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MessageService, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { getTauriRemoteSessionId } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { ForwardedPort, PortForwardingService } from '../electron-browser/port-forwarding/port-forwarding-service';

@injectable()
export class TauriPortForwardingService extends PortForwardingService {
    @inject(MessageService)
    protected readonly messageService: MessageService;

    override isValidAddress(value: string): boolean {
        if (!/^\d+$/.test(value)) {
            return false;
        }
        const port = Number(value);
        return port >= 1 && port <= 65535 && !this.forwardedPorts.some(forwarded => forwarded.localPort === port);
    }

    override getPortInputPlaceholder(): string {
        return nls.localize('theia/remote/portForwarding/remotePortPlaceholder', 'Remote port number (eg. 3000)');
    }

    override updatePort(port: ForwardedPort, value: string): void {
        const sessionId = getTauriRemoteSessionId(window.location.href);
        if (!sessionId || !this.isValidAddress(value)) {
            return;
        }
        const localPort = Number(value);
        this.provider.forwardPort(sessionId, { port: localPort, address: '127.0.0.1' }).then(() => {
            port.localPort = localPort;
            port.address = '127.0.0.1';
            port.editing = false;
            this.onDidChangePortsEmitter.fire();
        }).catch(error => this.messageService.error(`Could not forward port ${localPort}: ${error}`));
    }
}
