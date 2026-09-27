// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/electron-browser/style/dev-container-attach-screen.css';
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { WorkspaceOpenHandlerContribution } from '@theia/workspace/lib/browser/workspace-service';
import { RemoteRegistryContribution } from '@theia/remote/lib/electron-browser/remote-registry-contribution';
import { RemoteContainerConnectionProvider, RemoteContainerConnectionProviderPath } from '../electron-common/remote-container-connection-provider';
import { bindDevContainerPreferences } from '../electron-common/dev-container-preferences';
import { ContainerOutputProvider } from '../electron-browser/container-output-provider';
import { DevContainerAttachScreen } from '../electron-browser/dev-container-attach-screen';
import { TauriContainerConnectionContribution } from './tauri-container-connection-contribution';
import { TauriDevContainerStartupContribution } from './tauri-dev-container-startup-contribution';

export default new ContainerModule(bind => {
    bind(TauriContainerConnectionContribution).toSelf().inSingletonScope();
    bind(RemoteRegistryContribution).toService(TauriContainerConnectionContribution);
    bind(WorkspaceOpenHandlerContribution).toService(TauriContainerConnectionContribution);
    bind(ContainerOutputProvider).toSelf().inSingletonScope();
    bindDevContainerPreferences(bind);
    bind(RemoteContainerConnectionProvider).toDynamicValue(context => {
        const outputProvider = context.container.get(ContainerOutputProvider);
        return ServiceConnectionProvider.createLocalProxy<RemoteContainerConnectionProvider>(
            context.container, RemoteContainerConnectionProviderPath, outputProvider);
    }).inSingletonScope();
    bind(DevContainerAttachScreen).toSelf().inSingletonScope();
    bind(TauriDevContainerStartupContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TauriDevContainerStartupContribution);
});
