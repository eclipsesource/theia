// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { bindExternalTerminalService } from '../electron-node/external-terminal-backend-module';
import { LinuxExternalTerminalService } from '../electron-node/linux-external-terminal-service';
import { TauriLinuxExternalTerminalService } from './tauri-linux-external-terminal-service';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bindExternalTerminalService(bind);
    rebind(LinuxExternalTerminalService).to(TauriLinuxExternalTerminalService).inSingletonScope();
});
