// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as crypto from 'crypto';
import { injectable } from '@theia/core/shared/inversify';
import { RemoteSetupOptions, RemoteSetupResult, RemoteSetupService } from '../electron-node/setup/remote-setup-service';

@injectable()
export class TauriRemoteSetupService extends RemoteSetupService {
    protected override getRemoteAppName(): string {
        return `${super.getRemoteAppName()}-tauri`;
    }

    override setup(options: RemoteSetupOptions): Promise<RemoteSetupResult> {
        return super.setup({ ...options, gatewayToken: crypto.randomBytes(32).toString('hex') });
    }
}
