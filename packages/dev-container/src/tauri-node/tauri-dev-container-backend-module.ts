// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { DevContainerConnectionProvider } from '../electron-node/remote-container-connection-provider';
import { TauriContainerConnectionProvider } from './tauri-container-connection-provider';

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(ConnectionContainerModule.create(({ bind: bindConnection, rebind }) => {
        bindConnection(TauriContainerConnectionProvider).toSelf().inSingletonScope();
        rebind(DevContainerConnectionProvider).toService(TauriContainerConnectionProvider);
    }));
});
