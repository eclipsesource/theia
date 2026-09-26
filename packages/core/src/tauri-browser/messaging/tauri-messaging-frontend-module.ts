// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule, injectable, postConstruct } from 'inversify';
import { AbstractChannel } from '../../common/message-rpc/channel';
import { WriteBuffer } from '../../common/message-rpc';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { WebSocketConnectionSource } from '../../browser/messaging/ws-connection-source';
import { ServiceConnectionProvider } from '../../browser/messaging/service-connection-provider';
import { TauriNativeService, tauriNativeServicePath } from '../../tauri-common/tauri-native-service';
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution';
import { TauriCloseFrontendContribution } from '../tauri-close-frontend-contribution';
import { TauriWindowTitleContribution } from '../tauri-window-title-contribution';

class TauriBrowserChannel extends AbstractChannel {
    constructor(protected readonly webSocket: WebSocket) {
        super();
        webSocket.binaryType = 'arraybuffer';
        webSocket.addEventListener('message', event => {
            if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data);
                this.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(data));
            } else {
                this.onErrorEmitter.fire(new Error('Unexpected text frame on Tauri service channel'));
            }
        });
        webSocket.addEventListener('error', () => this.onErrorEmitter.fire(new Error('Tauri service WebSocket failed')));
    }

    getWriteBuffer(): WriteBuffer {
        const result = new Uint8ArrayWriteBuffer();
        result.onCommit(data => {
            if (this.webSocket.readyState === WebSocket.OPEN) {
                this.webSocket.send(data);
            } else {
                this.onErrorEmitter.fire(new Error('Tauri service WebSocket is closed'));
            }
        });
        return result;
    }
}

@injectable()
class TauriRawConnectionSource extends WebSocketConnectionSource {
    protected reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    @postConstruct()
    override openSocket(): void {
        this.connectRawSocket();
    }

    protected connectRawSocket(): void {
        const url = new URL('/tauri-services', window.location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const webSocket = new WebSocket(url);
        webSocket.addEventListener('open', () => {
            const channel = new TauriBrowserChannel(webSocket);
            this.currentChannel = channel;
            this.onSocketDidOpenEmitter.fire();
            this.onConnectionDidOpenEmitter.fire(channel);
        });
        webSocket.addEventListener('close', event => {
            if (this.currentChannel) {
                this.currentChannel.onCloseEmitter.fire({ reason: event.reason || 'Tauri service WebSocket closed', code: event.code });
                this.currentChannel.close();
            }
            this.onSocketDidCloseEmitter.fire();
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connectRawSocket(), 1000);
        });
        webSocket.addEventListener('message', () => this.onIncomingMessageActivityEmitter.fire());
    }
}

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    rebind(WebSocketConnectionSource).to(TauriRawConnectionSource).inSingletonScope();
    bind(TauriNativeService).toDynamicValue(context =>
        ServiceConnectionProvider.createProxy<TauriNativeService>(context.container, tauriNativeServicePath)
    ).inSingletonScope();
    bind(TauriCloseFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TauriCloseFrontendContribution);
    bind(TauriWindowTitleContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TauriWindowTitleContribution);
});
