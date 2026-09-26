// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { bindCommonHostedBackend } from '../node/plugin-dev-backend-module';
import { HostedInstanceManager } from '../node/hosted-instance-manager';
import { TauriHostedPluginRunner } from './tauri-hosted-instance-manager';

const hostedBackendConnectionModule = ConnectionContainerModule.create(({ bind }) => {
    bind(HostedInstanceManager).to(TauriHostedPluginRunner).inSingletonScope();
});

export default new ContainerModule(bind => {
    bindCommonHostedBackend(bind);
    bind(ConnectionContainerModule).toConstantValue(hostedBackendConnectionModule);
});
