// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

import { ContainerModule } from 'inversify';
import { BackendStopwatch, CommandRegistry, MeasurementOptions, OS } from '../common';
import { ApplicationInfo, ApplicationServer, ExtensionInfo } from '../common/application-protocol';
import { EnvVariable, EnvVariablesServer } from './../common/env-variables';
import { bindMessageService } from '../browser/frontend-application-bindings';
import { KeytarService } from '../common/keytar-protocol';
import { QuickPickService } from '../common/quick-pick-service';
import { QuickPickServiceImpl } from '../browser/quick-input';
import { BackendRequestService, RequestService } from '@theia/request';

export { bindMessageService };

export const frontendOnlyApplicationModule = new ContainerModule((bind, unbind, isBound, rebind) => {

    if (isBound(CommandRegistry)) {
        rebind(CommandRegistry).toSelf().inSingletonScope();
    } else {
        bind(CommandRegistry).toSelf().inSingletonScope();
    }

    const stopwatch: BackendStopwatch = {
        start: async (_name: string, _options?: MeasurementOptions | undefined): Promise<number> => -1,
        stop: async (_measurement: number, _message: string, _messageArgs: unknown[]): Promise<void> => { }
    };
    if (isBound(BackendStopwatch)) {
        rebind(BackendStopwatch).toConstantValue(stopwatch);
    } else {
        bind(BackendStopwatch).toConstantValue(stopwatch);
    }

    if (isBound(CommandRegistry)) {
        rebind(QuickPickService).to(QuickPickServiceImpl).inSingletonScope();
    } else {
        bind(QuickPickService).to(QuickPickServiceImpl).inSingletonScope();
    }

    const mockedApplicationServer: ApplicationServer = {
        getExtensionsInfos: async (): Promise<ExtensionInfo[]> => [],
        getApplicationInfo: async (): Promise<ApplicationInfo | undefined> => undefined,
        getBackendOS: async (): Promise<OS.Type> => OS.Type.Linux
    };
    if (isBound(ApplicationServer)) {
        rebind(ApplicationServer).toConstantValue(mockedApplicationServer);
    } else {
        bind(ApplicationServer).toConstantValue(mockedApplicationServer);
    }

    const varServer: EnvVariablesServer = {
        getExecPath: async (): Promise<string> => '',
        getVariables: async (): Promise<EnvVariable[]> => [],
        getValue: async (_key: string): Promise<EnvVariable | undefined> => undefined,
        getConfigDirUri: async (): Promise<string> => '',
        getHomeDirUri: async (): Promise<string> => '',
        getDrives: async (): Promise<string[]> => []
    };
    if (isBound(EnvVariablesServer)) {
        rebind(EnvVariablesServer).toConstantValue(varServer);
    } else {
        bind(EnvVariablesServer).toConstantValue(varServer);
    }

    const keyTarService: KeytarService = {
        deletePassword: () => Promise.resolve(false),
        findCredentials: () => Promise.resolve([]),
        findPassword: () => Promise.resolve(undefined),
        setPassword: () => Promise.resolve(),
        getPassword: () => Promise.resolve(undefined)
    };
    if (isBound(KeytarService)) {
        rebind<KeytarService>(KeytarService).toConstantValue(keyTarService);
    } else {
        bind<KeytarService>(KeytarService).toConstantValue(keyTarService);
    }

    const requestService: RequestService = {
        configure: () => Promise.resolve(),
        request: () => Promise.reject(),
        resolveProxy: () => Promise.resolve(undefined)
    };
    if (isBound(BackendRequestService)) {
        rebind<RequestService>(BackendRequestService).toConstantValue(requestService);
    } else {
        bind<RequestService>(BackendRequestService).toConstantValue(requestService);
    }

});
