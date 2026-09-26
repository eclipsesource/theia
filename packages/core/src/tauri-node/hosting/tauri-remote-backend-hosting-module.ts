// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { HttpConnectionValidator } from '../../node/hosting/browser-connection-token';

// The remote gateway module validates every HTTP request before route handlers.
// Consumers still need this binding for routes that request a validator directly.
export default new ContainerModule(bind => {
    const validator: HttpConnectionValidator = { validateRequest: (_request, _response, next) => next() };
    bind(HttpConnectionValidator).toConstantValue(validator);
});
