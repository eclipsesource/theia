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
    protected readonly pending = new Map<number, NodeJS.Timeout>();

    constructor(@inject(ILogger) @named('core:TauriCloseBackendCoordinator') protected readonly logger: ILogger) {
        process.on('message', message => {
            if (typeof message !== 'object' || !message || !('type' in message) || message.type !== 'close-request'
                || !('id' in message) || typeof message.id !== 'number') {
                return;
            }
            const id = message.id;
            if (!this.client) {
                // Wait briefly for the frontend to connect so it can check unsaved work.
                const timer = setTimeout(() => {
                    this.pending.delete(id);
                    process.send?.({ version: 1, type: 'close-response', id, allow: false });
                }, 13000);
                this.pending.set(id, timer);
                return;
            }
            this.confirmClose(id, this.client);
        });
    }

    protected confirmClose(id: number, client: RpcProxy<TauriCloseClient>): void {
        client.confirmClose().then(
            allow => process.send?.({ version: 1, type: 'close-response', id, allow: allow === true }),
            error => {
                this.logger.error('Tauri close confirmation failed:', error);
                process.send?.({ version: 1, type: 'close-response', id, allow: false });
            }
        );
    }

    register(client: RpcProxy<TauriCloseClient>): void {
        this.client = client;
        for (const [id, timer] of this.pending) {
            clearTimeout(timer);
            this.confirmClose(id, client);
        }
        this.pending.clear();
        client.onDidCloseConnection(() => {
            if (this.client === client) {
                this.client = undefined;
            }
        });
    }
}
