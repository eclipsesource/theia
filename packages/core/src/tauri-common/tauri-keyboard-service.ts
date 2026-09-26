// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { NativeKeyboardLayout } from '../common/keyboard/keyboard-layout-provider';

export const tauriKeyboardServicePath = '/services/tauri-keyboard';

export interface TauriKeyboardClient {
    onNativeLayoutChanged(layout: NativeKeyboardLayout): void;
}

export interface TauriKeyboardServer {
    getNativeLayout(): Promise<NativeKeyboardLayout>;
}
