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

import { ChatService, ChatSessionMetadata } from '@theia/ai-chat';
import { TaskContextService } from '@theia/ai-chat/lib/browser/task-context-service';
import { Command, CommandContribution, CommandRegistry, nls } from '@theia/core';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { codicon } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatSessionItemAction, ChatSessionItemActionContribution } from './chat-session-item-action-contribution';
import { ReviewIntentService } from './review/review-intent-service';

export const USE_SESSION_AS_REVIEW_INTENT_COMMAND: Command = {
    id: 'aiReview:useSessionAsIntent',
};

@injectable()
export class ReviewIntentSessionActionContribution implements ChatSessionItemActionContribution, CommandContribution {

    @inject(TaskContextService)
    protected readonly taskContextService: TaskContextService;

    @inject(ReviewIntentService)
    protected readonly intentService: ReviewIntentService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    getActions(_session: ChatSessionMetadata): ChatSessionItemAction[] {
        return [{
            commandId: USE_SESSION_AS_REVIEW_INTENT_COMMAND.id,
            iconClass: codicon('checklist'),
            tooltip: nls.localize('theia/ai-ide/useAsReviewIntent', 'Use as review intent'),
            priority: 5,
        }];
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(USE_SESSION_AS_REVIEW_INTENT_COMMAND, {
            execute: (session: ChatSessionMetadata) => this.addSessionAsIntent(session),
        });
    }

    async addSessionAsIntent(session: ChatSessionMetadata): Promise<void> {
        const changeSetId = this.intentService.activeChangeSetId;
        if (!changeSetId) {
            return;
        }

        const chatSession = this.chatService.getSession(session.sessionId);
        if (!chatSession) {
            return;
        }

        let summaryText: string;
        if (this.taskContextService.hasSummary(chatSession)) {
            summaryText = await this.taskContextService.getSummary(session.sessionId);
        } else {
            await this.taskContextService.summarize(chatSession);
            summaryText = await this.taskContextService.getSummary(session.sessionId);
        }

        this.intentService.addIntent(changeSetId, {
            id: generateUuid(),
            source: 'chat-session',
            label: session.title,
            content: summaryText,
        });
    }
}
