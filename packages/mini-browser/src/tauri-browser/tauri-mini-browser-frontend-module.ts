// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { LocationMapper } from '../browser/location-mapper-service';
import { TauriMiniBrowserService, tauriMiniBrowserServicePath } from '../common/tauri-mini-browser-service';
import { TauriFileLocationMapper } from './tauri-file-location-mapper';

export default new ContainerModule(bind => {
    bind(TauriFileLocationMapper).toSelf().inSingletonScope();
    bind(LocationMapper).toService(TauriFileLocationMapper);
    bind(TauriMiniBrowserService).toDynamicValue(
        context => WebSocketConnectionProvider.createLocalProxy(context.container, tauriMiniBrowserServicePath)
    ).inSingletonScope();
});
