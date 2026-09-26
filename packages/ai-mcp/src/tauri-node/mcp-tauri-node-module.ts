// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { MCPOAuthCallbackEndpoint } from '../node/mcp-oauth-callback-endpoint';
import { MCPOAuthLoopbackCallbackServer } from '../electron-node/mcp-oauth-loopback-callback-server';

// The Tauri backend also requires an unauthenticated, narrowly scoped OAuth redirect listener.
export default new ContainerModule(bind => {
    bind(MCPOAuthLoopbackCallbackServer).toSelf().inSingletonScope();
    bind(MCPOAuthCallbackEndpoint).toService(MCPOAuthLoopbackCallbackServer);
    bind(BackendApplicationContribution).toService(MCPOAuthLoopbackCallbackServer);
});
