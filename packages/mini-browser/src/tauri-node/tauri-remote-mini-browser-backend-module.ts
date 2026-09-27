// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { TauriRemoteMiniBrowserBackendService } from './tauri-remote-mini-browser-backend-service';

export default new ContainerModule(bind => {
    bind(TauriRemoteMiniBrowserBackendService).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriRemoteMiniBrowserBackendService);
});
