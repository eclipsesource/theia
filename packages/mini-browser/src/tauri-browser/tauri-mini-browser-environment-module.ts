// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MiniBrowserEnvironment } from '../browser/environment/mini-browser-environment';
import { TauriMiniBrowserEnvironment } from './tauri-mini-browser-environment';

export default new ContainerModule(bind => {
    bind(TauriMiniBrowserEnvironment).toSelf().inSingletonScope();
    bind(MiniBrowserEnvironment).toService(TauriMiniBrowserEnvironment);
    bind(FrontendApplicationContribution).toService(TauriMiniBrowserEnvironment);
});
