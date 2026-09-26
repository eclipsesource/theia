// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const TauriNativeService = Symbol('TauriNativeService');
export const tauriNativeServicePath = '/services/tauri-native';

export interface TauriFileFilter {
    name: string;
    extensions: string[];
}

export interface TauriFileDialogOptions {
    title?: string;
    defaultPath?: string;
    filters?: TauriFileFilter[];
    directory?: boolean;
    multiple?: boolean;
}

export interface TauriMenuItem {
    id?: string;
    label?: string;
    enabled?: boolean;
    checked?: boolean;
    type?: 'separator' | 'checkbox';
    submenu?: TauriMenuItem[];
}

/** Operations that the trusted frontend can request through the authenticated backend connection. */
export interface TauriNativeService {
    /** Open another workbench in an independent native window. The fragment is a workspace URI or !empty. */
    openWindow(fragment: string, search?: string): Promise<void>;
    setMenu(items: TauriMenuItem[]): Promise<void>;
    setWindowTitle(title: string): Promise<void>;
    focusWindow(): Promise<void>;
    minimizeWindow(): Promise<void>;
    toggleMaximize(): Promise<void>;
    toggleFullScreen(): Promise<void>;
    setWindowZoom(zoomLevel: number): Promise<void>;
    requestCloseWindow(): Promise<void>;
    readClipboardText(): Promise<string>;
    writeClipboardText(text: string): Promise<void>;
    openFile(): Promise<string | undefined>;
    showOpenDialog(options: TauriFileDialogOptions): Promise<string[] | undefined>;
    showSaveDialog(options: TauriFileDialogOptions): Promise<string | undefined>;
}
