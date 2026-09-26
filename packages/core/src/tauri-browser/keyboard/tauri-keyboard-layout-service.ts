// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named, postConstruct } from 'inversify';
import { ServiceConnectionProvider, RemoteConnectionProvider } from '../../browser/messaging/service-connection-provider';
import { Emitter, Event } from '../../common/event';
import { KeyboardLayoutChangeNotifier, KeyboardLayoutProvider, NativeKeyboardLayout } from '../../common/keyboard/keyboard-layout-provider';
import { ILogger } from '../../common/logger';
import { RpcProxy } from '../../common/messaging/proxy-factory';
import { TauriKeyboardClient, TauriKeyboardServer, tauriKeyboardServicePath } from '../../tauri-common/tauri-keyboard-service';

@injectable()
export class TauriKeyboardLayoutService implements KeyboardLayoutProvider, KeyboardLayoutChangeNotifier, TauriKeyboardClient {
    protected readonly changed = new Emitter<NativeKeyboardLayout>();
    protected server: RpcProxy<TauriKeyboardServer>;

    constructor(
        @inject(RemoteConnectionProvider) protected readonly connections: ServiceConnectionProvider,
        @inject(ILogger) @named('core:TauriKeyboardLayoutService') protected readonly logger: ILogger
    ) { }

    @postConstruct()
    protected initialize(): void {
        this.server = this.connections.createProxy<TauriKeyboardServer>(tauriKeyboardServicePath, this);
    }

    get onDidChangeNativeLayout(): Event<NativeKeyboardLayout> {
        return this.changed.event;
    }

    getNativeLayout(): Promise<NativeKeyboardLayout> {
        return this.server.getNativeLayout();
    }

    onNativeLayoutChanged(layout: NativeKeyboardLayout): void {
        this.logger.info(`Native keyboard layout changed: ${JSON.stringify(layout.info)}`);
        this.changed.fire(layout);
    }
}
