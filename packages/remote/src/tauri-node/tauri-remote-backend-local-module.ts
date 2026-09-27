// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { RemoteSetupService } from '../electron-node/setup/remote-setup-service';
import { RemoteSSHConnectionProviderImpl } from '../electron-node/ssh/remote-ssh-connection-provider';
import { TauriRemoteSetupService } from './tauri-remote-setup-service';
import { TauriRemoteSSHConnectionProvider } from './tauri-remote-ssh-connection-provider';
import { RemoteStatusServiceImpl } from '../electron-node/remote-status-service';
import { TauriRemoteStatusService } from './tauri-remote-status-service';
import { RemotePortForwardingProviderImpl } from '../electron-node/remote-port-forwarding-provider';
import { TauriRemotePortForwardingProvider } from './tauri-remote-port-forwarding-provider';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(TauriRemoteSetupService).toSelf().inSingletonScope();
    rebind(RemoteSetupService).toService(TauriRemoteSetupService);
    bind(TauriRemoteStatusService).toSelf().inSingletonScope();
    rebind(RemoteStatusServiceImpl).toService(TauriRemoteStatusService);
    bind(ConnectionContainerModule).toConstantValue(ConnectionContainerModule.create(({ bind: bindConnection, rebind: rebindConnection }) => {
        bindConnection(TauriRemoteSSHConnectionProvider).toSelf().inSingletonScope();
        rebindConnection(RemoteSSHConnectionProviderImpl).toService(TauriRemoteSSHConnectionProvider);
        bindConnection(TauriRemotePortForwardingProvider).toSelf().inSingletonScope();
        rebindConnection(RemotePortForwardingProviderImpl).toService(TauriRemotePortForwardingProvider);
    }));
});
