// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { CommandContribution, MenuContribution, bindRootContributionProvider } from '../../common';
import { ClipboardService } from '../../browser/clipboard-service';
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution';
import { KeybindingContribution } from '../../browser/keybinding';
import { DefaultSecondaryWindowService } from '../../browser/window/default-secondary-window-service';
import { DefaultWindowService } from '../../browser/window/default-window-service';
import { SecondaryWindowService } from '../../browser/window/secondary-window-service';
import { WindowService } from '../../browser/window/window-service';
import { WindowFocusService } from '../../browser/window/window-focus-service';
import { DefaultWindowLaunchArgs, WindowLaunchArgs } from '../../browser/window/window-launch-args';
import { WindowTitleContribution } from '../../browser/window/window-title-service';
import { TauriWindowCommands } from './tauri-window-commands';
import { TauriClipboardService } from './tauri-clipboard-service';
import { TauriWindowService } from './tauri-window-service';
import { PreferenceContribution } from '../../common/preferences/preference-schema';
import { tauriWindowPreferencesSchema } from './tauri-window-preferences';

export default new ContainerModule(bind => {
    bind(TauriWindowService).toSelf().inSingletonScope();
    bind(DefaultWindowService).toService(TauriWindowService);
    bind(WindowService).toService(TauriWindowService);
    bind(FrontendApplicationContribution).toService(TauriWindowService);
    bind(ClipboardService).to(TauriClipboardService).inSingletonScope();
    bind(SecondaryWindowService).to(DefaultSecondaryWindowService).inSingletonScope();
    bind(WindowFocusService).toSelf().inSingletonScope();
    bind(DefaultWindowLaunchArgs).toSelf().inSingletonScope();
    bind(WindowLaunchArgs).toService(DefaultWindowLaunchArgs);
    bindRootContributionProvider(bind, WindowTitleContribution);
    bind(PreferenceContribution).toConstantValue({ schema: tauriWindowPreferencesSchema });
    bind(TauriWindowCommands).toSelf().inSingletonScope();
    bind(CommandContribution).toService(TauriWindowCommands);
    bind(KeybindingContribution).toService(TauriWindowCommands);
    bind(MenuContribution).toService(TauriWindowCommands);
});
