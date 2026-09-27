// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as express from '@theia/core/shared/express';
import { injectable } from '@theia/core/shared/inversify';
import { isUUID } from '@theia/core/lib/common/uuid';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { TauriMiniBrowserFileGrants } from './tauri-mini-browser-file-grants';

/** The remote backend validates preview paths again before serving file bytes. */
@injectable()
export class TauriRemoteMiniBrowserBackendService implements BackendApplicationContribution {
    protected readonly grants = new TauriMiniBrowserFileGrants();

    configure(app: express.Application): void {
        app.post('/tauri-mini-browser/grant', express.json({ limit: '12kb' }), (request, response) => {
            const { uri, uuid } = request.body || {};
            this.grants.authorizeFile(uri, uuid).then(() => response.sendStatus(204), () => response.sendStatus(400));
        });
        app.use('/tauri-mini-browser/:uuid', (request, response) => {
            this.serve(request, response).catch(() => response.sendStatus(500));
        });
    }

    protected async serve(request: express.Request, response: express.Response): Promise<void> {
        if (!isUUID(request.params.uuid)) {
            response.sendStatus(403);
            return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.sendStatus(405);
            return;
        }
        const result = await this.grants.resolveFile(request.params.uuid, request.path);
        if (result.status !== 200) {
            response.sendStatus(result.status);
            return;
        }
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.sendFile(result.file, { dotfiles: 'deny' });
    }
}
