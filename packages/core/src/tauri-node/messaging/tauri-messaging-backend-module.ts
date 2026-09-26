// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import * as cookie from 'cookie';
import { ContainerModule, inject, injectable } from 'inversify';
import WebSocket = require('ws');
import { DefaultMessagingService } from '../../node/messaging/default-messaging-service';
import { WsRequestValidator, WsRequestValidatorContribution } from '../../node/ws-request-validators';
import { BackendApplicationContribution, EarlyExpressMiddleware } from '../../node/backend-application';
import { AbstractChannel } from '../../common/message-rpc/channel';
import { WriteBuffer } from '../../common/message-rpc';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { ConnectionHandler, RpcConnectionHandler } from '../../common/messaging';
import { tauriNativeServicePath } from '../../tauri-common/tauri-native-service';
import { TauriNativeBackendService } from '../tauri-native-backend-service';
import { TauriCloseClient, tauriCloseServicePath } from '../../tauri-common/tauri-close-service';
import { TauriCloseBackendCoordinator } from '../tauri-close-backend-coordinator';
import { TauriUntrustedContentServer } from '../tauri-untrusted-content-server';

const TauriSecurityToken = Symbol('TauriSecurityToken');
const securityToken = process.env.THEIA_TAURI_TOKEN;
delete process.env.THEIA_TAURI_TOKEN;
const cookieName = process.env.THEIA_TAURI_COOKIE_NAME || 'THEIA_TAURI_TOKEN';
delete process.env.THEIA_TAURI_COOKIE_NAME;
if (!/^THEIA_TAURI_TOKEN(?:_[a-z0-9]+)?$/.test(cookieName)) {
    throw new Error('Invalid Tauri security cookie name');
}
if (!securityToken || !/^[0-9a-f]{64}$/.test(securityToken)) {
    throw new Error('Tauri backend requires a per-launch security token');
}

@injectable()
class TauriTokenValidator implements WsRequestValidatorContribution {
    constructor(@inject(TauriSecurityToken) protected readonly expected: string) { }

    allowRequest(request: http.IncomingMessage): boolean {
        const expectedOrigin = `http://127.0.0.1:${request.socket.localPort}`;
        if (request.headers.host !== `127.0.0.1:${request.socket.localPort}`
            || (request.headers.origin && request.headers.origin !== expectedOrigin)) {
            return false;
        }
        if (request.headers.referer) {
            try {
                if (new URL(request.headers.referer).origin !== expectedOrigin) {
                    return false;
                }
            } catch {
                return false;
            }
        }
        // Match the Electron metrics exception for local collectors. The host,
        // Origin and Referer checks above still reject embedded-content callers.
        if (request.method === 'GET' && request.url === '/metrics') {
            return true;
        }
        const header = request.headers.cookie;
        if (typeof header !== 'string') {
            return false;
        }
        const received = cookie.parse(header)[cookieName];
        if (!received || !/^[0-9a-f]{64}$/.test(received)) {
            return false;
        }
        return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(this.expected, 'hex'));
    }

    allowWsUpgrade(request: http.IncomingMessage): boolean {
        const expectedOrigin = `http://127.0.0.1:${request.socket.localPort}`;
        return request.headers.origin === expectedOrigin && this.allowRequest(request);
    }
}

@injectable()
class TauriHttpAuthContribution implements BackendApplicationContribution {
    constructor(
        @inject(EarlyExpressMiddleware) protected readonly earlyMiddleware: EarlyExpressMiddleware,
        @inject(TauriTokenValidator) protected readonly validator: TauriTokenValidator
    ) { }

    initialize(): void {
        this.earlyMiddleware.handlers.push((request, response, next) => {
            if (this.validator.allowRequest(request)) {
                next();
            } else {
                response.sendStatus(403);
            }
        });
    }
}

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
class TauriMessagingService extends DefaultMessagingService {
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

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(TauriSecurityToken).toConstantValue(securityToken);
    bind(TauriTokenValidator).toSelf().inSingletonScope();
    bind(WsRequestValidatorContribution).toService(TauriTokenValidator);
    bind(TauriHttpAuthContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriHttpAuthContribution);
    bind(TauriNativeBackendService).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler(tauriNativeServicePath, () => context.container.get(TauriNativeBackendService))
    ).inSingletonScope();
    bind(TauriCloseBackendCoordinator).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler<TauriCloseClient>(tauriCloseServicePath, client => {
            context.container.get(TauriCloseBackendCoordinator).register(client);
            return {};
        })
    ).inSingletonScope();
    bind(TauriUntrustedContentServer).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriUntrustedContentServer);
    rebind(DefaultMessagingService).to(TauriMessagingService).inSingletonScope();
});
