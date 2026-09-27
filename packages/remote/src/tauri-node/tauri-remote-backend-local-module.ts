// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { RemoteSetupService } from '../electron-node/setup/remote-setup-service';
import { TauriRemoteSetupService } from './tauri-remote-setup-service';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(TauriRemoteSetupService).toSelf().inSingletonScope();
    rebind(RemoteSetupService).toService(TauriRemoteSetupService);
});
