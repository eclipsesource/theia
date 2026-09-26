// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { FileDialogService } from '../../browser';
import { TauriFileDialogService } from './tauri-file-dialog-service';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(TauriFileDialogService).toSelf().inSingletonScope();
    rebind(FileDialogService).toService(TauriFileDialogService);
});
