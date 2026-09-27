// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { bindRootContributionProvider, CommandContribution } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, isRemote } from '@theia/core/lib/browser';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';
import { RemoteFileSystemProvider, remoteFileSystemPath, RemoteFileSystemProxyFactory, RemoteFileSystemServer } from '@theia/filesystem/lib/common/remote-file-system-provider';
import { UserStorageContribution } from '@theia/userstorage/lib/browser/user-storage-contribution';
import { WorkspaceHandlingContribution, WorkspaceOpenHandlerContribution } from '@theia/workspace/lib/browser';
import { envVariablesPath, EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { RemoteSSHConnectionProvider, RemoteSSHConnectionProviderPath } from '../electron-common/remote-ssh-connection-provider';
import { RemoteStatusService, RemoteStatusServicePath } from '../electron-common/remote-status-service';
import { bindRemotePreferences } from '../electron-common/remote-preferences';
import { RemoteRegistryContribution } from '../electron-browser/remote-registry-contribution';
import { RemoteService } from '../electron-browser/remote-service';
import { RemoteCliArgsCollector } from '../electron-browser/remote-cli-args-collector';
import { LocalEnvVariablesServer, LocalRemoteFileSystemContribution, LocalRemoteFileSystemProvider, LocalRemoteFileSytemServer } from '../electron-browser/local-backend-services';
import { TauriRemoteFrontendContribution } from './tauri-remote-frontend-contribution';
import { TauriRemoteSSHContribution } from './tauri-remote-ssh-contribution';
import { TauriRemoteUserStorageContribution } from './tauri-remote-user-storage-provider';
import { TauriRemoteLocalWorkspaceContribution } from './tauri-remote-local-workspace-contribution';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(TauriRemoteFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TauriRemoteFrontendContribution);
    bind(CommandContribution).toService(TauriRemoteFrontendContribution);
    bindRootContributionProvider(bind, RemoteRegistryContribution);
    bind(TauriRemoteSSHContribution).toSelf().inSingletonScope();
    bind(RemoteRegistryContribution).toService(TauriRemoteSSHContribution);
    bindRemotePreferences(bind);
    bind(RemoteService).toSelf().inSingletonScope();
    bind(RemoteCliArgsCollector).toSelf().inSingletonScope();

    bind(RemoteSSHConnectionProvider).toDynamicValue(context =>
        ServiceConnectionProvider.createLocalProxy<RemoteSSHConnectionProvider>(context.container, RemoteSSHConnectionProviderPath)).inSingletonScope();
    bind(RemoteStatusService).toDynamicValue(context =>
        ServiceConnectionProvider.createLocalProxy<RemoteStatusService>(context.container, RemoteStatusServicePath)).inSingletonScope();

    if (isRemote) {
        bind(LocalRemoteFileSytemServer).toDynamicValue(context =>
            ServiceConnectionProvider.createLocalProxy(context.container, remoteFileSystemPath, new RemoteFileSystemProxyFactory()));
        bind(LocalEnvVariablesServer).toDynamicValue(context =>
            ServiceConnectionProvider.createLocalProxy<EnvVariablesServer>(context.container, envVariablesPath));
        bind(LocalRemoteFileSystemProvider).toSelf().inSingletonScope();
        bind(TauriRemoteLocalWorkspaceContribution).toSelf().inSingletonScope();
        bind(WorkspaceOpenHandlerContribution).toService(TauriRemoteLocalWorkspaceContribution);
        bind(WorkspaceHandlingContribution).toService(TauriRemoteLocalWorkspaceContribution);
        bind(LocalRemoteFileSystemContribution).toSelf().inSingletonScope();
        bind(FileServiceContribution).toService(LocalRemoteFileSystemContribution);
    } else {
        bind(LocalRemoteFileSytemServer).toService(RemoteFileSystemServer);
        bind(LocalEnvVariablesServer).toService(EnvVariablesServer);
        bind(LocalRemoteFileSystemProvider).toService(RemoteFileSystemProvider);
    }
    rebind(UserStorageContribution).to(TauriRemoteUserStorageContribution).inSingletonScope();
});
