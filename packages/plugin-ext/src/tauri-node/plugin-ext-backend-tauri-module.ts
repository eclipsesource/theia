// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as http from 'http';
import * as path from 'path';
import * as express from '@theia/core/shared/express';
import { ContainerModule, inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { bindHostedBackend } from '../hosted/node/plugin-ext-hosted-backend-module';
import { bindMainBackend } from '../main/node/plugin-ext-backend-module';

/**
 * Webview pages get their own loopback address. This server only serves the
 * unprivileged bootstrap assets; it never accepts Theia service connections.
 */
@injectable()
class TauriWebviewStaticServer implements BackendApplicationContribution {
    protected server: http.Server | undefined;

    constructor(@inject(ApplicationPackage) protected readonly applicationPackage: ApplicationPackage) { }

    async onStart(backend: http.Server): Promise<void> {
        const address = backend.address();
        if (!address || typeof address === 'string') {
            throw new Error('Tauri webview server requires a TCP backend address');
        }
        const app = express();
        const assets = path.join(this.applicationPackage.projectPath, 'lib', 'webview', 'pre');
        app.use((request, response, next) => {
            if (!/^[a-z0-9-]+\.webview\.localhost:\d+$/i.test(request.headers.host || '')) {
                response.sendStatus(403);
            } else {
                next();
            }
        });
        app.use('/webview', express.static(assets));
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

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindMainBackend(bind, unbind, isBound, rebind);
    bindHostedBackend(bind);
    bind(TauriWebviewStaticServer).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriWebviewStaticServer);
});
