// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { bindRootContributionProvider } from '../common/contribution-provider';
import { TauriMainApplication, TauriMainApplicationContribution } from './tauri-main-application';

export default new ContainerModule(bind => {
    bind(TauriMainApplication).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, TauriMainApplicationContribution);
});
