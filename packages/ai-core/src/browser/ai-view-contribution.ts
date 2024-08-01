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
import { CommandContribution, CommandRegistry, ContributionProvider, MaybePromise, MenuModelRegistry } from '@theia/core';
import { AbstractViewContribution, CommonMenus, FrontendApplicationContribution, KeybindingRegistry, PreferenceService, Widget } from '@theia/core/lib/browser';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { PREFERENCE_NAME_ENABLE_EXPERIMENTAL } from './ai-core-preferences';

@injectable()
export class AIViewContribution<T extends Widget> extends AbstractViewContribution<T> {
    static readonly EXPERIMENTAL_AI_CONTEXT_KEY = 'ai.experimental.enabled';

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    protected isExperimentalEnabled = false;

    enableExperimentalFeatures(isEnabled: boolean): void {
        this.isExperimentalEnabled = isEnabled;
        if (!isEnabled) {
            this.closeView();
        }
    }

    @postConstruct()
    protected init(): void {
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === PREFERENCE_NAME_ENABLE_EXPERIMENTAL) {
                this.isExperimentalEnabled = e.newValue;
            }
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        if (this.toggleCommand) {
            commands.registerCommand(this.toggleCommand, {
                execute: () => this.toggleView(),
                isEnabled: () => this.isExperimentalEnabled
            });
        }
        this.quickView?.registerItem({
            label: this.viewLabel,
            when: AIViewContribution.EXPERIMENTAL_AI_CONTEXT_KEY,
            open: () => this.openView({ activate: true })
        });

    }

    override registerMenus(menus: MenuModelRegistry): void {
        if (this.toggleCommand) {
            menus.registerMenuAction(CommonMenus.VIEW_VIEWS, {
                commandId: this.toggleCommand.id,
                when: AIViewContribution.EXPERIMENTAL_AI_CONTEXT_KEY,
                label: this.viewLabel
            });
        }
    }
    override registerKeybindings(keybindings: KeybindingRegistry): void {
        if (this.toggleCommand && this.options.toggleKeybinding) {
            keybindings.registerKeybinding({
                command: this.toggleCommand.id,
                when: AIViewContribution.EXPERIMENTAL_AI_CONTEXT_KEY,
                keybinding: this.options.toggleKeybinding
            });
        }
    }
}

@injectable()
export class AIViewFrontendApplicationContribution implements FrontendApplicationContribution {
    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(ContributionProvider) @named(CommandContribution)
    protected readonly commandContributions: ContributionProvider<CommandContribution>;
    protected aiExperimentalEnabled: ContextKey<boolean>;

    initialize(): MaybePromise<void> {
        this.aiExperimentalEnabled = this.contextKeyService.createKey('ai.experimental.enabled', false);
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === PREFERENCE_NAME_ENABLE_EXPERIMENTAL) {
                this.aiExperimentalEnabled.set(e.newValue);
                this.AIViewContributions.forEach(c => c.enableExperimentalFeatures(e.newValue));
            }
        });
    }

    get AIViewContributions(): AIViewContribution<Widget>[] {
        return this.commandContributions.getContributions().filter(c => c instanceof AIViewContribution) as AIViewContribution<Widget>[];
    }
}
