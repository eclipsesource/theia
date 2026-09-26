// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { TauriMiniBrowserService, tauriMiniBrowserServicePath } from '../common/tauri-mini-browser-service';
import { TauriMiniBrowserBackendService } from './tauri-mini-browser-backend-service';

export default new ContainerModule(bind => {
    bind(TauriMiniBrowserBackendService).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriMiniBrowserBackendService);
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler<TauriMiniBrowserService>(tauriMiniBrowserServicePath, () => context.container.get(TauriMiniBrowserBackendService))
    ).inSingletonScope();
});
