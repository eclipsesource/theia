// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as path from 'path';
import * as express from '@theia/core/shared/express';
import { ContainerModule, inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { TauriUntrustedContentServer } from '@theia/core/lib/tauri-node/tauri-untrusted-content-server';
import { bindHostedBackend } from '../hosted/node/plugin-ext-hosted-backend-module';
import { bindMainBackend } from '../main/node/plugin-ext-backend-module';

/**
 * Webview pages get their own loopback address. Only unprivileged bootstrap
 * assets are served here; the shared server never accepts service connections.
 */
@injectable()
class TauriWebviewStaticServer implements BackendApplicationContribution {
    constructor(
        @inject(ApplicationPackage) protected readonly applicationPackage: ApplicationPackage,
        @inject(TauriUntrustedContentServer) protected readonly contentServer: TauriUntrustedContentServer
    ) { }

    initialize(): void {
        const assets = path.join(this.applicationPackage.projectPath, 'lib', 'webview', 'pre');
        this.contentServer.use('/webview', (request, response, next) => {
            if (!/^[a-z0-9-]+\.webview\.localhost:\d+$/i.test(request.headers.host || '')) {
                response.sendStatus(403);
            } else {
                next();
            }
        }, express.static(assets));
    }
}

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindMainBackend(bind, unbind, isBound, rebind);
    bindHostedBackend(bind);
    bind(TauriWebviewStaticServer).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriWebviewStaticServer);
});
