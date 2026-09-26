// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as crypto from 'crypto';
import * as http from 'http';
import { ContainerModule, inject, injectable } from 'inversify';
import { BackendApplicationContribution, EarlyExpressMiddleware } from '../../node/backend-application';
import { DefaultMessagingService } from '../../node/messaging/default-messaging-service';
import { WsRequestValidatorContribution } from '../../node/ws-request-validators';
import { TauriMessagingService } from './tauri-raw-messaging';

const RemoteGatewayToken = Symbol('RemoteGatewayToken');
const token = process.env.THEIA_TAURI_REMOTE_TOKEN;
delete process.env.THEIA_TAURI_REMOTE_TOKEN;
if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    throw new Error('Tauri remote backend requires a per-session gateway token');
}

@injectable()
class RemoteGatewayValidator implements WsRequestValidatorContribution {
    constructor(@inject(RemoteGatewayToken) protected readonly expected: string) { }

    allowRequest(request: http.IncomingMessage): boolean {
        // The session gateway is a Node client. Browser requests carry an Origin and
        // cannot provide the custom authorization header on a WebSocket upgrade.
        if (request.headers.origin || request.headers.referer) {
            return false;
        }
        const received = request.headers['x-theia-remote-token'];
        if (typeof received !== 'string' || !/^[0-9a-f]{64}$/.test(received)) {
            return false;
        }
        return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(this.expected, 'hex'));
    }

    allowWsUpgrade(request: http.IncomingMessage): boolean {
        return this.allowRequest(request);
    }
}

@injectable()
class RemoteGatewayHttpAuthContribution implements BackendApplicationContribution {
    constructor(
        @inject(EarlyExpressMiddleware) protected readonly earlyMiddleware: EarlyExpressMiddleware,
        @inject(RemoteGatewayValidator) protected readonly validator: RemoteGatewayValidator
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
    bind(RemoteGatewayToken).toConstantValue(token);
    bind(RemoteGatewayValidator).toSelf().inSingletonScope();
    bind(WsRequestValidatorContribution).toService(RemoteGatewayValidator);
    bind(RemoteGatewayHttpAuthContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(RemoteGatewayHttpAuthContribution);
    rebind(DefaultMessagingService).to(TauriMessagingService).inSingletonScope();
});
