// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CommandContribution, MenuContribution } from '@theia/core';
import { KeybindingContribution, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { TauriSystemAppService, tauriSystemAppServicePath } from '../tauri-common/tauri-system-app-service';
import { TauriNavigatorContribution } from './tauri-navigator-contribution';

export default new ContainerModule(bind => {
    bind(TauriNavigatorContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(TauriNavigatorContribution);
    bind(MenuContribution).toService(TauriNavigatorContribution);
    bind(KeybindingContribution).toService(TauriNavigatorContribution);
    bind(TauriSystemAppService).toDynamicValue(context =>
        ServiceConnectionProvider.createProxy<TauriSystemAppService>(context.container, tauriSystemAppServicePath)
    ).inSingletonScope();
});
