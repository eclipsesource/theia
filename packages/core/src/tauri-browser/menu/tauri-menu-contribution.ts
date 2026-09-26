// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named } from 'inversify';
import debounce = require('lodash.debounce');
import { ILogger, PreferenceService } from '../../common';
import { CommandMenu, CompoundMenuNode, MAIN_MENU_BAR, MenuModelRegistry, MenuNode, MenuPath, RenderedMenuNode } from '../../common/menu';
import { ContextKeyService, ContextMatcher } from '../../browser/context-key-service';
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution';
import { TauriMenuItem, TauriNativeService } from '../../tauri-common/tauri-native-service';

@injectable()
export class TauriMenuContribution implements FrontendApplicationContribution {
    protected readonly itemPrefix = crypto.randomUUID().replace(/-/g, '');
    protected nextItemId = 0;
    protected actions = new Map<string, () => Promise<void>>();
    protected updateQueue = Promise.resolve();
    protected focusedElement: HTMLElement | undefined;
    protected readonly scheduleUpdate = debounce(() => this.updateMenu(), 100);

    constructor(
        @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry,
        @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService,
        @inject(PreferenceService) protected readonly preferences: PreferenceService,
        @inject(TauriNativeService) protected readonly nativeService: TauriNativeService,
        @inject(ILogger) @named('core:TauriMenuContribution') protected readonly logger: ILogger
    ) { }

    onStart(): void {
        window.addEventListener('theia-tauri-menu', this.onMenuEvent);
        document.addEventListener('focusin', this.onFocusIn);
        window.addEventListener('focus', this.scheduleUpdate);
        this.menus.onDidChange(() => this.scheduleUpdate());
        this.contextKeys.onDidChange?.(() => this.scheduleUpdate());
        this.preferences.onPreferenceChanged(() => this.scheduleUpdate());
        this.preferences.ready.then(() => this.updateMenu());
    }

    onStop(): void {
        window.removeEventListener('theia-tauri-menu', this.onMenuEvent);
        document.removeEventListener('focusin', this.onFocusIn);
        window.removeEventListener('focus', this.scheduleUpdate);
        this.scheduleUpdate.cancel();
    }

    protected readonly onFocusIn = (event: FocusEvent): void => {
        if (event.target instanceof HTMLElement) {
            this.focusedElement = event.target;
        }
        this.scheduleUpdate();
    };

    protected readonly onMenuEvent = (event: Event): void => {
        const id = (event as CustomEvent<unknown>).detail;
        if (typeof id !== 'string') {
            return;
        }
        const run = this.actions.get(id);
        if (run) {
            this.focusedElement?.focus({ preventScroll: true });
            run().catch(error => this.logger.error('Native menu action failed:', error));
        }
    };

    protected updateMenu(): Promise<void> {
        this.updateQueue = this.updateQueue.then(async () => {
            const actions = new Map<string, () => Promise<void>>();
            const visible = !['hidden', 'compact'].includes(this.preferences.get('window.menuBarVisibility', 'classic'));
            const root = this.menus.getMenuNode(MAIN_MENU_BAR);
            const items = visible && root && CompoundMenuNode.is(root)
                ? this.buildItems(MAIN_MENU_BAR, root.children, this.contextKeys, actions) : [];
            await this.nativeService.setMenu(items);
            this.actions = actions;
        }).catch(error => this.logger.error('Could not update native menu:', error));
        return this.updateQueue;
    }

    protected buildItems(path: MenuPath, nodes: MenuNode[], context: ContextMatcher, actions: Map<string, () => Promise<void>>): TauriMenuItem[] {
        const items: TauriMenuItem[] = [];
        for (const node of nodes) {
            const nodePath = node.effectiveMenuPath || [...path, node.id];
            if (!node.isVisible(nodePath, context, undefined)) {
                continue;
            }
            if (CompoundMenuNode.is(node)) {
                if (node.id === 'inline') {
                    continue;
                }
                const childContext = node.contextKeyOverlays
                    ? this.contextKeys.createOverlay(Object.entries(node.contextKeyOverlays)) : context;
                const children = this.buildItems(nodePath, node.children, childContext, actions);
                if (!children.length) {
                    continue;
                }
                if (RenderedMenuNode.is(node)) {
                    items.push({ label: node.label, submenu: children });
                } else {
                    if (items.length && items[items.length - 1].type !== 'separator') {
                        items.push({ type: 'separator' });
                    }
                    items.push(...children, { type: 'separator' });
                }
            } else if (CommandMenu.is(node)) {
                const id = `menu_${this.itemPrefix}_${++this.nextItemId}`;
                const checked = node.isToggled(nodePath);
                items.push({ id, label: node.label, enabled: node.isEnabled(nodePath),
                    type: checked ? 'checkbox' : undefined, checked });
                actions.set(id, () => node.run(nodePath).finally(() => this.scheduleUpdate()));
            }
        }
        while (items[items.length - 1]?.type === 'separator') {
            items.pop();
        }
        return items;
    }
}
