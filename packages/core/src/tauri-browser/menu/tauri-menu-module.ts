// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { MenuNodeFactory } from '../../common';
import { ContextMenuRenderer } from '../../browser/context-menu-renderer';
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution';
import { BrowserContextMenuRenderer } from '../../browser/menu/browser-context-menu-renderer';
import { BrowserMainMenuFactory } from '../../browser/menu/browser-menu-plugin';
import { BrowserMenuNodeFactory } from '../../browser/menu/browser-menu-node-factory';
import { TauriMenuContribution } from './tauri-menu-contribution';

export default new ContainerModule(bind => {
    bind(BrowserMainMenuFactory).toSelf().inSingletonScope();
    bind(ContextMenuRenderer).to(BrowserContextMenuRenderer).inSingletonScope();
    bind(BrowserMenuNodeFactory).toSelf().inSingletonScope();
    bind(MenuNodeFactory).toService(BrowserMenuNodeFactory);
    bind(TauriMenuContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TauriMenuContribution);
});
