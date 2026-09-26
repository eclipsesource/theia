// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const TauriSystemAppService = Symbol('TauriSystemAppService');
export const tauriSystemAppServicePath = '/services/tauri-system-app';

export interface TauriSystemAppService {
    openFile(uri: string): Promise<void>;
    openContainingFolder(uri: string): Promise<void>;
}
