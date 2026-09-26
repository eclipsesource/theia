// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { KeyboardLayoutChangeNotifier, KeyboardLayoutProvider } from '../../common/keyboard/keyboard-layout-provider';
import { TauriKeyboardLayoutService } from './tauri-keyboard-layout-service';

export default new ContainerModule(bind => {
    bind(TauriKeyboardLayoutService).toSelf().inSingletonScope();
    bind(KeyboardLayoutProvider).toService(TauriKeyboardLayoutService);
    bind(KeyboardLayoutChangeNotifier).toService(TauriKeyboardLayoutService);
});
