// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationServer } from '@theia/core/lib/node';
import { SampleBackendApplicationServer } from './sample-backend-application-server';
import { RpcTestServiceImpl } from './rpc-test-service';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { RpcTestService, RPC_TEST_PATH } from '../common/rpc-test-service';

export default new ContainerModule(bind => {
    if (process.env.SAMPLE_BACKEND_APPLICATION_SERVER) {
        bind(BackendApplicationServer).to(SampleBackendApplicationServer).inSingletonScope();
    }
    bind(RpcTestServiceImpl).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx => new JsonRpcConnectionHandler<RpcTestService>(RPC_TEST_PATH, () => ctx.container.get<RpcTestService>(RpcTestServiceImpl)))
        .inSingletonScope();
});
