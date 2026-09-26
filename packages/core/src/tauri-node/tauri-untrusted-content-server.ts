// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as http from 'http';
import * as express from 'express';
import { injectable } from 'inversify';
import { BackendApplicationContribution } from '../node/backend-application';

/** Routes for untrusted iframe content on ::1, separate from the authenticated workbench origin. */
@injectable()
export class TauriUntrustedContentServer implements BackendApplicationContribution {
    protected readonly routes: { path: string; handlers: express.RequestHandler[] }[] = [];
    protected server: http.Server | undefined;

    use(path: string, ...handlers: express.RequestHandler[]): void {
        this.routes.push({ path, handlers });
    }

    async onStart(backend: http.Server): Promise<void> {
        if (!backend.listening) {
            await new Promise<void>((resolve, reject) => {
                const onListening = (): void => { backend.off('error', onError); resolve(); };
                const onError = (error: Error): void => { backend.off('listening', onListening); reject(error); };
                backend.once('listening', onListening);
                backend.once('error', onError);
            });
        }
        const address = backend.address();
        if (!address || typeof address === 'string') {
            throw new Error('Tauri content server requires a TCP backend address');
        }
        const app = express();
        for (const route of [...this.routes].sort((left, right) => right.path.length - left.path.length)) {
            app.use(route.path, ...route.handlers);
        }
        this.server = http.createServer(app);
        this.server.on('upgrade', (_request, socket) => socket.destroy());
        await new Promise<void>((resolve, reject) => {
            this.server!.once('error', reject);
            this.server!.listen(address.port, '::1', () => {
                this.server!.off('error', reject);
                resolve();
            });
        });
    }

    async onStop(): Promise<void> {
        const server = this.server;
        if (server) {
            await new Promise<void>(resolve => server.close(() => resolve()));
            this.server = undefined;
        }
    }
}
