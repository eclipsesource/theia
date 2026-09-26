// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as nativeKeymap from '@theia/electron/shared/native-keymap';
import { injectable } from 'inversify';
import { NativeKeyboardLayout } from '../../common/keyboard/keyboard-layout-provider';
import { RpcProxy } from '../../common/messaging/proxy-factory';
import { TauriKeyboardClient, TauriKeyboardServer } from '../../tauri-common/tauri-keyboard-service';

@injectable()
export class TauriKeyboardLayoutServer implements TauriKeyboardServer {
    protected readonly clients = new Set<RpcProxy<TauriKeyboardClient>>();
    protected lastInfo = JSON.stringify(nativeKeymap.getCurrentKeyboardLayout());

    constructor() {
        // native-keymap reports the current X11 layout, but its Linux change
        // callback is a no-op. Poll the small layout descriptor instead of the
        // full key map and read the map only when it changes.
        setInterval(() => {
            const info = nativeKeymap.getCurrentKeyboardLayout();
            const fingerprint = JSON.stringify(info);
            if (!info || fingerprint === this.lastInfo) {
                return;
            }
            this.lastInfo = fingerprint;
            const layout = { info, mapping: nativeKeymap.getKeyMap() };
            for (const client of this.clients) {
                client.onNativeLayoutChanged(layout);
            }
        }, 1000).unref();
    }

    register(client: RpcProxy<TauriKeyboardClient>): void {
        this.clients.add(client);
        client.onDidCloseConnection(() => this.clients.delete(client));
    }

    getNativeLayout(): Promise<NativeKeyboardLayout> {
        return Promise.resolve(this.currentLayout());
    }

    protected currentLayout(): NativeKeyboardLayout {
        return { info: nativeKeymap.getCurrentKeyboardLayout(), mapping: nativeKeymap.getKeyMap() };
    }
}
