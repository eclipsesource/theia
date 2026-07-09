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

import { ChatAgentService, ChatService, ChatSessionMetadata } from '@theia/ai-chat';
import { formatTimeAgo } from '@theia/ai-chat-ui/lib/browser/chat-date-utils';
import { buttonKeyboardProps, HoverService, isActivationKey } from '@theia/core/lib/browser';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { CommandRegistry, ContributionProvider } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { ChatSessionItemAction, ChatSessionItemActionContribution } from './chat-session-item-action-contribution';
import { ChatSessionItem, UnreadStateProvider } from './chat-session-item';

/** When both Active and Restored sections are non-empty, keep at least this many Restored slots. */
const RESTORED_MIN_RESERVATION = 5;

export interface SectionedSessions {
    active: ChatSessionMetadata[];
    restored: ChatSessionMetadata[];
}

export interface VisibleSessionSlots {
    activeCount: number;
    restoredCount: number;
}

/**
 * Allocates the capped number of visible items between the Active and Restored sections of the
 * overview. When both sections are non-empty, up to {@link RESTORED_MIN_RESERVATION} slots are
 * reserved for Restored so active sessions cannot crowd it out entirely. A cap of 0 hides the
 * inline list (every session stays reachable via the "Browse all chats..." link).
 */
export function computeVisibleSessionSlots(activeTotal: number, restoredTotal: number, maxSessions: number): VisibleSessionSlots {
    const cap = Math.max(0, maxSessions);
    if (cap === 0) {
        return { activeCount: 0, restoredCount: 0 };
    }
    if (restoredTotal === 0) {
        return { activeCount: Math.min(activeTotal, cap), restoredCount: 0 };
    }
    if (activeTotal === 0) {
        return { activeCount: 0, restoredCount: Math.min(restoredTotal, cap) };
    }
    const reserved = Math.min(restoredTotal, Math.min(RESTORED_MIN_RESERVATION, Math.max(1, cap - 1)));
    const activeCount = Math.min(activeTotal, cap - reserved);
    const restoredCount = Math.min(restoredTotal, cap - activeCount);
    return { activeCount, restoredCount };
}

export interface SessionsListProps {
    sections: SectionedSessions;
    /** Total cap on items shown; overflow surfaces via the Browse all link. */
    maxSessions: number;
    renderItem: (session: ChatSessionMetadata, isRestored: boolean) => React.ReactNode;
    onBrowseAll: () => void;
}

export interface SessionItemHandlerDeps {
    chatService: ChatService;
    chatAgentService: ChatAgentService;
    hoverService: HoverService;
    markdownRenderer: MarkdownRenderer;
    commandRegistry: CommandRegistry;
    unreadState: UnreadStateProvider;
    chatSessionItemActionContributions: ContributionProvider<ChatSessionItemActionContribution>;
}

export function createSessionItemRenderer(deps: SessionItemHandlerDeps): {
    renderSessionItem: (session: ChatSessionMetadata, isRestored: boolean) => React.ReactNode;
} {
    const renderSessionItem = (session: ChatSessionMetadata, isRestored: boolean): React.ReactNode => {
        const actions = deps.chatSessionItemActionContributions
            .getContributions()
            .flatMap(c => c.getActions(session))
            .filter(action => deps.commandRegistry.isEnabled(action.commandId, session))
            .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        return (
            <ChatSessionItem
                key={session.sessionId}
                session={session}
                isRestored={isRestored}
                chatService={deps.chatService}
                chatAgentService={deps.chatAgentService}
                hoverService={deps.hoverService}
                markdownRenderer={deps.markdownRenderer}
                unreadState={deps.unreadState}
                onClick={async () => {
                    await deps.chatService.getOrRestoreSession(session.sessionId);
                    deps.chatService.setActiveSession(session.sessionId, { focus: true });
                }}
                actions={actions}
                onAction={(action: ChatSessionItemAction, s: ChatSessionMetadata) => {
                    deps.commandRegistry.executeCommand(action.commandId, s);
                }}
                formatTimeAgo={date => formatTimeAgo(date)}
            />
        );
    };
    return { renderSessionItem };
}

export function SessionsList({ sections, maxSessions, renderItem, onBrowseAll }: SessionsListProps): React.ReactElement {
    const total = sections.active.length + sections.restored.length;
    const { activeCount, restoredCount } = computeVisibleSessionSlots(sections.active.length, sections.restored.length, maxSessions);
    const activeVisible = sections.active.slice(0, activeCount);
    const restoredVisible = sections.restored.slice(0, restoredCount);
    const hiddenCount = total - activeVisible.length - restoredVisible.length;

    return (
        <div className="theia-WelcomeMessage-SessionsList">
            {activeVisible.length > 0 && (
                <div className="theia-WelcomeMessage-SessionsGroup">
                    <div className="theia-WelcomeMessage-SessionsHeader">
                        {nls.localizeByDefault('Active')}
                    </div>
                    {activeVisible.map(s => renderItem(s, false))}
                </div>
            )}
            {restoredVisible.length > 0 && (
                <div className="theia-WelcomeMessage-SessionsGroup">
                    <div className="theia-WelcomeMessage-SessionsHeader">
                        {nls.localize('theia/ai/ide/sectionRestored', 'Restored')}
                    </div>
                    {restoredVisible.map(s => renderItem(s, true))}
                </div>
            )}
            {hiddenCount > 0 && (
                <div className="theia-WelcomeMessage-SessionsFooter">
                    <a className="theia-WelcomeMessage-FooterLink"
                        {...buttonKeyboardProps(nls.localize('theia/ai/ide/browseAllChats', 'Browse all chats...'))}
                        onClick={onBrowseAll}
                        onKeyDown={e => {
                            if (isActivationKey(e)) {
                                e.preventDefault();
                                onBrowseAll();
                            }
                        }}>
                        {nls.localize('theia/ai/ide/browseAllChats', 'Browse all chats...')}
                    </a>
                </div>
            )}
        </div>
    );
}
