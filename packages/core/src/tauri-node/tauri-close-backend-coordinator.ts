// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named } from 'inversify';
import { ILogger } from '../common/logger';
import { RpcProxy } from '../common/messaging/proxy-factory';
import { TauriCloseClient } from '../tauri-common/tauri-close-service';

@injectable()
export class TauriCloseBackendCoordinator {
    protected client: RpcProxy<TauriCloseClient> | undefined;

    constructor(@inject(ILogger) @named('core:TauriCloseBackendCoordinator') protected readonly logger: ILogger) {
        process.on('message', message => {
            if (typeof message !== 'object' || !message || !('type' in message) || message.type !== 'close-request'
                || !('id' in message) || typeof message.id !== 'number') {
                return;
            }
            const id = message.id;
            if (!this.client) {
                process.send?.({ version: 1, type: 'close-response', id, allow: false });
                return;
            }
            this.client.confirmClose().then(
                allow => process.send?.({ version: 1, type: 'close-response', id, allow: allow === true }),
                error => {
                    this.logger.error('Tauri close confirmation failed:', error);
                    process.send?.({ version: 1, type: 'close-response', id, allow: false });
                }
            );
        });
    }

    register(client: RpcProxy<TauriCloseClient>): void {
        this.client = client;
        client.onDidCloseConnection(() => {
            if (this.client === client) {
                this.client = undefined;
            }
        });
    }
}
