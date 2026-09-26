// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as http from 'http';
import * as https from 'https';
import { inject, injectable } from 'inversify';
import WebSocket = require('ws');
import { DefaultMessagingService } from '../../node/messaging/default-messaging-service';
import { WsRequestValidator } from '../../node/ws-request-validators';
import { AbstractChannel } from '../../common/message-rpc/channel';
import { WriteBuffer } from '../../common/message-rpc';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';

class TauriNodeChannel extends AbstractChannel {
    constructor(protected readonly webSocket: WebSocket) {
        super();
        webSocket.on('message', data => {
            if (!Buffer.isBuffer(data) && !(data instanceof ArrayBuffer)) {
                this.onErrorEmitter.fire(new Error('Unexpected service WebSocket frame'));
                return;
            }
            const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
            this.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(buffer));
        });
        webSocket.on('error', error => this.onErrorEmitter.fire(error));
        webSocket.on('close', (code, reason) => {
            this.onCloseEmitter.fire({ reason: reason.toString() || 'Tauri service WebSocket closed', code });
            this.close();
        });
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
export class TauriMessagingService extends DefaultMessagingService {
    @inject(WsRequestValidator)
    protected readonly wsRequestValidator: WsRequestValidator;

    onStart(server: http.Server | https.Server): void {
        const webSocketServer = new WebSocket.Server({ noServer: true, maxPayload: 1e8 });
        server.on('upgrade', (request, socket, head) => {
            if (new URL(request.url || '/', 'http://127.0.0.1').pathname !== '/tauri-services') {
                return;
            }
            this.wsRequestValidator.allowWsUpgrade(request).then(allowed => {
                if (!allowed) {
                    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                    socket.destroy();
                    return;
                }
                webSocketServer.handleUpgrade(request, socket, head, webSocket => {
                    this.handleConnection(new TauriNodeChannel(webSocket));
                });
            }).catch(error => {
                this.logger.error('Tauri WebSocket validation failed:', error);
                socket.destroy();
            });
        });
        server.on('close', () => webSocketServer.close());
    }
}
