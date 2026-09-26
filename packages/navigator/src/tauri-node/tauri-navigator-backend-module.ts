// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { TauriSystemAppService, tauriSystemAppServicePath } from '../tauri-common/tauri-system-app-service';
import { TauriSystemAppServiceImpl } from './tauri-system-app-service';

export default new ContainerModule(bind => {
    bind(TauriSystemAppServiceImpl).toSelf().inSingletonScope();
    bind(TauriSystemAppService).toService(TauriSystemAppServiceImpl);
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler(tauriSystemAppServicePath, () => context.container.get(TauriSystemAppService))
    ).inSingletonScope();
});
