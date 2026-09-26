// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const TauriMiniBrowserService = Symbol('TauriMiniBrowserService');
export const tauriMiniBrowserServicePath = '/services/tauri-mini-browser';

/** Grants a temporary, directory-scoped isolated origin for a local preview. */
export interface TauriMiniBrowserService {
    authorizeFile(uri: string, uuid: string): Promise<void>;
}
