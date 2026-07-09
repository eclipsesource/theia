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

import { ChatWelcomeMessageProvider } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import {
    ChatAgentService, ChatService
} from '@theia/ai-chat';
import { BYPASS_MODEL_REQUIREMENT_PREF, WELCOME_SCREEN_SESSIONS_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { AI_CHAT_SHOW_CHATS_COMMAND } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { ChatSessionItemActionContribution } from './chat-session-item-action-contribution';
import { ChatSessionListService } from './chat-session-list-service';
import { createSessionItemRenderer, SectionedSessions, SessionsList } from './chat-session-list-components';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
import { CommandRegistry, ContributionProvider, Emitter, Event, PreferenceService } from '@theia/core';
import { HoverService } from '@theia/core/lib/browser';
import { MarkdownRenderer, MarkdownRendererFactory } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

@injectable()
export class ChatSessionsWelcomeMessageProvider implements ChatWelcomeMessageProvider {

    readonly priority = 50;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(MarkdownRendererFactory)
    protected readonly markdownRendererFactory: MarkdownRendererFactory;

    @inject(ContributionProvider) @named(ChatSessionItemActionContribution)
    protected readonly chatSessionItemActionContributions: ContributionProvider<ChatSessionItemActionContribution>;

    @inject(FrontendLanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(ChatSessionListService)
    protected readonly sessionListService: ChatSessionListService;

    protected _inputEnabled = false;

    protected _markdownRenderer: MarkdownRenderer | undefined;
    protected get markdownRenderer(): MarkdownRenderer {
        if (!this._markdownRenderer) {
            this._markdownRenderer = this.markdownRendererFactory();
        }
        return this._markdownRenderer;
    }

    protected sessionItemRenderer: ReturnType<typeof createSessionItemRenderer> | undefined;
    protected getSessionItemRenderer(): ReturnType<typeof createSessionItemRenderer> {
        if (!this.sessionItemRenderer) {
            this.sessionItemRenderer = createSessionItemRenderer({
                chatService: this.chatService,
                chatAgentService: this.chatAgentService,
                hoverService: this.hoverService,
                markdownRenderer: this.markdownRenderer,
                commandRegistry: this.commandRegistry,
                unreadState: this.sessionListService,
                chatSessionItemActionContributions: this.chatSessionItemActionContributions
            });
        }
        return this.sessionItemRenderer;
    }

    protected readonly onStateChangedEmitter = new Emitter<void>();
    readonly onStateChanged: Event<void> = this.onStateChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.sessionListService.onStateChanged(() => {
            this.onStateChangedEmitter.fire();
        });

        this.updateInputEnabled();
        this.languageModelRegistry.onChange(() => {
            this.updateInputEnabled();
        });
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === BYPASS_MODEL_REQUIREMENT_PREF) {
                this.updateInputEnabled();
            } else if (e.preferenceName === WELCOME_SCREEN_SESSIONS_PREF) {
                this.onStateChangedEmitter.fire();
            }
        });
    }

    protected async updateInputEnabled(): Promise<void> {
        const models = await this.languageModelRegistry.getLanguageModels();
        const hasReadyModels = models.some(model => model.status.status === 'ready');
        const bypassed = this.preferenceService.get<boolean>(BYPASS_MODEL_REQUIREMENT_PREF, false);
        const enabled = hasReadyModels || bypassed;
        if (this._inputEnabled !== enabled) {
            this._inputEnabled = enabled;
            this.onStateChangedEmitter.fire();
        }
    }

    renderWelcomeMessage(): React.ReactNode {
        if (!this._inputEnabled) {
            return undefined;
        }
        const sections = this.sessionListService.getSections();
        const sessionCount = sections.active.length + sections.restored.length;
        if (!this.sessionListService.isPersistenceEnabled() || sessionCount === 0) {
            return undefined;
        }
        return this.renderSessionsSection(sections);
    }

    protected renderSessionsSection(sections: SectionedSessions): React.ReactNode {
        const maxSessions = this.preferenceService.get<number>(WELCOME_SCREEN_SESSIONS_PREF, 20);
        return (
            <div className="theia-WelcomeMessage" key="sessions-section">
                <div className="theia-WelcomeMessage-SessionsSection">
                    <SessionsList
                        sections={sections}
                        maxSessions={maxSessions}
                        renderItem={this.getSessionItemRenderer().renderSessionItem}
                        onBrowseAll={this.handleBrowseAllChats}
                    />
                </div>
            </div>
        );
    }

    protected handleBrowseAllChats = (): void => {
        this.commandRegistry.executeCommand(AI_CHAT_SHOW_CHATS_COMMAND.id);
    };
}
