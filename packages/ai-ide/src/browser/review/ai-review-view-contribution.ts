// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { AIViewContribution, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { nls } from '@theia/core';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { codicon } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AIReviewWidget } from './ai-review-widget';

export const AI_REVIEW_TOGGLE_COMMAND_ID = 'aiReview:toggle';

export const AI_REVIEW_REFRESH_COMMAND = Command.toLocalizedCommand({
    id: 'aiReview:refresh',
    iconClass: codicon('refresh'),
    category: 'AI',
    label: 'Refresh Review'
}, 'theia/ai-ide/refreshReview');

@injectable()
export class AIReviewViewContribution extends AIViewContribution<AIReviewWidget> implements TabBarToolbarContribution {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    constructor() {
        super({
            widgetId: AIReviewWidget.ID,
            widgetName: AIReviewWidget.LABEL,
            defaultWidgetOptions: {
                area: 'left'
            },
            toggleCommandId: AI_REVIEW_TOGGLE_COMMAND_ID,
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(AI_REVIEW_REFRESH_COMMAND, this.commandHandlerFactory({
            execute: async () => {
                const widget = await this.widget;
                await widget.reReviewAll();
            }
        }));
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: AI_REVIEW_REFRESH_COMMAND.id,
            command: AI_REVIEW_REFRESH_COMMAND.id,
            tooltip: nls.localize('theia/ai-ide/refreshReview', 'Refresh Review'),
            isVisible: widget => this.activationService.isActive && widget instanceof AIReviewWidget,
            when: ENABLE_AI_CONTEXT_KEY,
        });
    }
}
