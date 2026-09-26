// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { NodeRequestOptions, NodeRequestService } from '@theia/request/lib/node-request-service';
import { BackendApplicationCliContribution } from '../../node/backend-application';
import { TauriCookieName, TauriSecurityToken } from '../messaging/tauri-messaging-backend-module';

@injectable()
export class TauriBackendRequestService extends NodeRequestService {
    @inject(TauriSecurityToken) protected readonly securityToken: string;
    @inject(TauriCookieName) protected readonly cookieName: string;
    @inject(BackendApplicationCliContribution) protected readonly cliParams: BackendApplicationCliContribution;

    protected override async processOptions(options: NodeRequestOptions): Promise<NodeRequestOptions> {
        options = await super.processOptions(options);
        if (!options.url) {
            return options;
        }
        const endpoint = new URL(options.url);
        if (endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1'
            && Number(endpoint.port || '80') === this.cliParams.port) {
            const existing = options.headers?.['Cookie'];
            options.headers = {
                ...options.headers,
                Cookie: `${existing ? `${existing}; ` : ''}${this.cookieName}=${this.securityToken}`
            };
        }
        return options;
    }
}
