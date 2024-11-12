// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AIDER_CONNECTOR_PATH, AiderConnector, AiderConnectorClient } from '../common/api';
import { AiderConnectorImpl } from './aider-connector';

export const OpenAiModelFactory = Symbol('OpenAiModelFactory');

export default new ContainerModule(bind => {
    bind(AiderConnector).to(AiderConnectorImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<AiderConnectorClient>(AIDER_CONNECTOR_PATH, client => {
            const connector = ctx.container.get<AiderConnector>(AiderConnector);
            connector.setClient(client);
            return connector;

        })
    ).inSingletonScope();
});
