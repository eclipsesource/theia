// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { RequestService } from '@theia/request';
import { ProxyingBrowserRequestService } from '../../browser/request/browser-request-service';

export default new ContainerModule(bind => {
    bind(RequestService).to(ProxyingBrowserRequestService).inSingletonScope();
});
