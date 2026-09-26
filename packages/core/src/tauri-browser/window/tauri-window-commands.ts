// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, PreferenceScope, PreferenceService } from '../../common';
import { CommonCommands } from '../../browser/common-frontend-contribution';
import { CommonMenus } from '../../browser/common-menus';
import { KeybindingContribution, KeybindingRegistry } from '../../browser/keybinding';
import { WindowService } from '../../browser/window/window-service';
import { TauriNativeService } from '../../tauri-common/tauri-native-service';
import { PREF_WINDOW_ZOOM_LEVEL, ZoomLevel } from '../../electron-common/electron-window-preferences';

@injectable()
export class TauriWindowCommands implements CommandContribution, KeybindingContribution, MenuContribution {
    static readonly RELOAD = Command.toDefaultLocalizedCommand({ id: 'view.reload', label: 'Reload Window' });
    static readonly TOGGLE_FULL_SCREEN = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.toggleFullScreen', category: CommonCommands.VIEW_CATEGORY, label: 'Toggle Full Screen'
    });
    static readonly MINIMIZE = Command.toLocalizedCommand({ id: 'window.minimize', label: 'Minimize Window' });
    static readonly TOGGLE_MAXIMIZE = Command.toLocalizedCommand({ id: 'window.toggleMaximize', label: 'Toggle Maximize Window' });
    static readonly ZOOM_IN = Command.toDefaultLocalizedCommand({ id: 'view.zoomIn', label: 'Zoom In' });
    static readonly ZOOM_OUT = Command.toDefaultLocalizedCommand({ id: 'view.zoomOut', label: 'Zoom Out' });
    static readonly RESET_ZOOM = Command.toDefaultLocalizedCommand({ id: 'view.resetZoom', label: 'Reset Zoom' });
    static readonly CLOSE_WINDOW = Command.toDefaultLocalizedCommand({ id: 'close.window', label: 'Close Window' });

    constructor(
        @inject(TauriNativeService) protected readonly nativeService: TauriNativeService,
        @inject(WindowService) protected readonly windowService: WindowService,
        @inject(PreferenceService) protected readonly preferenceService: PreferenceService
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TauriWindowCommands.RELOAD, { execute: () => this.windowService.reload() });
        commands.registerCommand(TauriWindowCommands.TOGGLE_FULL_SCREEN, { execute: () => this.nativeService.toggleFullScreen() });
        commands.registerCommand(TauriWindowCommands.MINIMIZE, { execute: () => this.nativeService.minimizeWindow() });
        commands.registerCommand(TauriWindowCommands.TOGGLE_MAXIMIZE, { execute: () => this.nativeService.toggleMaximize() });
        commands.registerCommand(TauriWindowCommands.ZOOM_IN, { execute: () => this.changeZoom(1) });
        commands.registerCommand(TauriWindowCommands.ZOOM_OUT, { execute: () => this.changeZoom(-1) });
        commands.registerCommand(TauriWindowCommands.RESET_ZOOM, {
            execute: () => this.preferenceService.set(PREF_WINDOW_ZOOM_LEVEL, ZoomLevel.DEFAULT, PreferenceScope.User)
        });
        commands.registerCommand(TauriWindowCommands.CLOSE_WINDOW, { execute: () => this.nativeService.requestCloseWindow() });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({ command: TauriWindowCommands.TOGGLE_FULL_SCREEN.id, keybinding: 'f11' });
        registry.registerKeybinding({ command: TauriWindowCommands.RELOAD.id, keybinding: 'ctrlcmd+r' });
        registry.registerKeybinding({ command: TauriWindowCommands.ZOOM_IN.id, keybinding: 'ctrlcmd+=' });
        registry.registerKeybinding({ command: TauriWindowCommands.ZOOM_IN.id, keybinding: 'ctrlcmd+add' });
        registry.registerKeybinding({ command: TauriWindowCommands.ZOOM_OUT.id, keybinding: 'ctrlcmd+-' });
        registry.registerKeybinding({ command: TauriWindowCommands.ZOOM_OUT.id, keybinding: 'ctrlcmd+subtract' });
        registry.registerKeybinding({ command: TauriWindowCommands.RESET_ZOOM.id, keybinding: 'ctrlcmd+0' });
        registry.registerKeybinding({ command: TauriWindowCommands.CLOSE_WINDOW.id, keybinding: 'ctrl+q' });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(CommonMenus.VIEW_APPEARANCE_SUBMENU_SCREEN, {
            commandId: TauriWindowCommands.TOGGLE_FULL_SCREEN.id,
            order: '0'
        });
        const zoomMenu = [...CommonMenus.VIEW_APPEARANCE_SUBMENU, '4_appearance_submenu_zoom'];
        registry.registerMenuAction(zoomMenu, { commandId: TauriWindowCommands.ZOOM_IN.id, order: 'z1' });
        registry.registerMenuAction(zoomMenu, { commandId: TauriWindowCommands.ZOOM_OUT.id, order: 'z2' });
        registry.registerMenuAction(zoomMenu, { commandId: TauriWindowCommands.RESET_ZOOM.id, order: 'z3' });
        registry.registerMenuAction(CommonMenus.FILE_CLOSE, { commandId: TauriWindowCommands.CLOSE_WINDOW.id });
    }

    protected changeZoom(direction: 1 | -1): Promise<void> {
        const current = this.preferenceService.get<number>(PREF_WINDOW_ZOOM_LEVEL, ZoomLevel.DEFAULT);
        const step = ZoomLevel.VARIATION;
        const next = direction > 0 ? Math.floor(current / step) * step + step : Math.ceil(current / step) * step - step;
        return this.preferenceService.set(PREF_WINDOW_ZOOM_LEVEL, Math.max(ZoomLevel.MIN, Math.min(ZoomLevel.MAX, next)), PreferenceScope.User);
    }
}
