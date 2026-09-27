// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as http from 'http';
import * as crypto from 'crypto';
import * as cookie from 'cookie';
import { ContainerModule, inject, injectable } from 'inversify';
import { DefaultMessagingService } from '../../node/messaging/default-messaging-service';
import { TauriMessagingService, TauriWebSocketListenerContribution } from './tauri-raw-messaging';
import { WsRequestValidatorContribution } from '../../node/ws-request-validators';
import { BackendApplicationContribution, EarlyExpressMiddleware } from '../../node/backend-application';
import { ConnectionHandler, RpcConnectionHandler } from '../../common/messaging';
import { tauriNativeServicePath } from '../../tauri-common/tauri-native-service';
import { TauriNativeBackendService } from '../tauri-native-backend-service';
import { TauriCloseClient, tauriCloseServicePath } from '../../tauri-common/tauri-close-service';
import { TauriCloseBackendCoordinator } from '../tauri-close-backend-coordinator';
import { TauriUntrustedContentServer } from '../tauri-untrusted-content-server';
import { TauriRemoteGateway } from './tauri-remote-gateway';
import { bindRootContributionProvider } from '../../common/contribution-provider';

export const TauriSecurityToken = Symbol('TauriSecurityToken');
export const TauriCookieName = Symbol('TauriCookieName');
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

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bindRootContributionProvider(bind, TauriWebSocketListenerContribution);
    bind(TauriSecurityToken).toConstantValue(securityToken);
    bind(TauriCookieName).toConstantValue(cookieName);
    bind(TauriTokenValidator).toSelf().inSingletonScope();
    bind(WsRequestValidatorContribution).toService(TauriTokenValidator);
    bind(TauriHttpAuthContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriHttpAuthContribution);
    bind(TauriNativeBackendService).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler(tauriNativeServicePath, () => context.container.get(TauriNativeBackendService))
    ).inSingletonScope();
    bind(TauriCloseBackendCoordinator).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriCloseBackendCoordinator);
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler<TauriCloseClient>(tauriCloseServicePath, client => {
            context.container.get(TauriCloseBackendCoordinator).register(client);
            return {};
        })
    ).inSingletonScope();
    bind(TauriUntrustedContentServer).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriUntrustedContentServer);
    bind(TauriRemoteGateway).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TauriRemoteGateway);
    rebind(DefaultMessagingService).to(TauriMessagingService).inSingletonScope();
});
