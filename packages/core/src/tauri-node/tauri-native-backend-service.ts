// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from 'inversify';
import { TauriFileDialogOptions, TauriNativeService } from '../tauri-common/tauri-native-service';

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
}

@injectable()
export class TauriNativeBackendService implements TauriNativeService {
    protected nextId = 0;
    protected readonly pending = new Map<number, PendingRequest>();
    protected readonly windowId = process.env.THEIA_TAURI_WINDOW_ID || 'main';

    constructor() {
        process.on('message', message => {
            if (typeof message !== 'object' || !message || !('type' in message) || message.type !== 'native-response'
                || !('id' in message) || typeof message.id !== 'number') {
                return;
            }
            const request = this.pending.get(message.id);
            if (!request) {
                return;
            }
            this.pending.delete(message.id);
            clearTimeout(request.timer);
            if ('ok' in message && message.ok === true) {
                request.resolve('result' in message ? message.result ?? undefined : undefined);
            } else {
                request.reject(new Error('error' in message && typeof message.error === 'string' ? message.error : 'Native request failed'));
            }
        });
        process.on('disconnect', () => {
            for (const request of this.pending.values()) {
                clearTimeout(request.timer);
                request.reject(new Error('Desktop controller disconnected'));
            }
            this.pending.clear();
        });
    }

    setWindowTitle(title: string): Promise<void> {
        if (typeof title !== 'string' || title.length < 1 || title.length > 200 || /[\r\n\0]/.test(title)) {
            return Promise.reject(new Error('Invalid window title'));
        }
        return this.request<void>('set-window-title', { title }, 10000);
    }

    openWindow(fragment: string, search = ''): Promise<void> {
        if (typeof fragment !== 'string' || fragment.length > 8192 || /[\r\n\0]/.test(fragment)
            || typeof search !== 'string' || search.length > 4096 || /[\r\n\0#]/.test(search)) {
            return Promise.reject(new Error('Invalid window URL'));
        }
        return this.request<void>('open-window', { fragment, search }, 50000);
    }

    focusWindow(): Promise<void> {
        return this.request<void>('focus-window', {}, 10000);
    }

    minimizeWindow(): Promise<void> {
        return this.request<void>('minimize-window', {}, 10000);
    }

    toggleMaximize(): Promise<void> {
        return this.request<void>('toggle-maximize', {}, 10000);
    }

    toggleFullScreen(): Promise<void> {
        return this.request<void>('toggle-fullscreen', {}, 10000);
    }

    setWindowZoom(zoomLevel: number): Promise<void> {
        if (!Number.isFinite(zoomLevel) || zoomLevel < -8 || zoomLevel > 9) {
            return Promise.reject(new Error('Invalid window zoom level'));
        }
        return this.request<void>('set-window-zoom', { zoomLevel }, 10000);
    }

    requestCloseWindow(): Promise<void> {
        return this.request<void>('close-window', {}, 10000);
    }

    readClipboardText(): Promise<string> {
        return this.request<string>('read-clipboard-text', {}, 10000);
    }

    writeClipboardText(text: string): Promise<void> {
        if (typeof text !== 'string' || text.length > 1024 * 1024) {
            return Promise.reject(new Error('Invalid clipboard text'));
        }
        return this.request<void>('write-clipboard-text', { text }, 10000);
    }

    openFile(): Promise<string | undefined> {
        return this.request<string | undefined>('open-file', {}, 121000);
    }

    showOpenDialog(options: TauriFileDialogOptions): Promise<string[] | undefined> {
        return this.request<string[] | undefined>('show-open-dialog', { options }, 121000);
    }

    showSaveDialog(options: TauriFileDialogOptions): Promise<string | undefined> {
        return this.request<string | undefined>('show-save-dialog', { options }, 121000);
    }

    protected request<T>(operation: 'set-window-title' | 'focus-window' | 'minimize-window' | 'toggle-maximize' | 'toggle-fullscreen' | 'set-window-zoom' | 'close-window'
        | 'read-clipboard-text' | 'write-clipboard-text'
        | 'open-file' | 'show-open-dialog' | 'show-save-dialog' | 'open-window', payload: object, timeout: number): Promise<T> {
        if (!process.connected || !process.send) {
            return Promise.reject(new Error('Desktop controller is unavailable'));
        }
        const id = ++this.nextId;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('Native request timed out'));
            }, timeout);
            this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
            process.send!({ version: 1, type: 'native-request', id, operation, window: this.windowId, ...payload }, error => {
                if (error) {
                    const request = this.pending.get(id);
                    if (request) {
                        this.pending.delete(id);
                        clearTimeout(request.timer);
                        reject(error);
                    }
                }
            });
        });
    }
}
