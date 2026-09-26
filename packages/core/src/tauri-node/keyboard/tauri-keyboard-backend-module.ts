// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { ConnectionHandler, RpcConnectionHandler } from '../../common/messaging';
import { TauriKeyboardClient, tauriKeyboardServicePath } from '../../tauri-common/tauri-keyboard-service';
import { TauriKeyboardLayoutServer } from './tauri-keyboard-layout-server';

export default new ContainerModule(bind => {
    bind(TauriKeyboardLayoutServer).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler<TauriKeyboardClient>(tauriKeyboardServicePath, client => {
            const server = context.container.get(TauriKeyboardLayoutServer);
            server.register(client);
            return server;
        })
    ).inSingletonScope();
});
