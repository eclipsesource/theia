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

import { ChatService, ChatSession, ChatSessionMetadata } from '@theia/ai-chat';
import { PERSISTED_SESSION_LIMIT_PREF, SESSION_STORAGE_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { DisposableCollection, Emitter, Event, PreferenceService } from '@theia/core';
import { ApplicationShell } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { UnreadStateProvider } from './chat-session-item';
import { SectionedSessions } from './chat-session-list-components';

@injectable()
export class ChatSessionListService implements UnreadStateProvider {

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    private readonly unreadSessions = new Map<string, { unread: boolean; seenRequests: number; seenCompleted: number; listener: DisposableCollection }>();
    private readonly onUnreadChangedEmitter = new Emitter<string>();
    readonly onUnreadChanged: Event<string> = this.onUnreadChangedEmitter.event;

    protected _persistedSessions: ChatSessionMetadata[] = [];

    protected readonly onStateChangedEmitter = new Emitter<void>();
    readonly onStateChanged: Event<void> = this.onStateChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        for (const session of this.chatService.getSessions()) {
            this.watchSession(session);
        }

        this.chatService.onSessionEvent(event => {
            if (event.type === 'created') {
                const s = this.chatService.getSession(event.sessionId);
                if (s) {
                    this.watchSession(s);
                }
            } else if (event.type === 'activeChange' && event.sessionId) {
                this.markSessionRead(event.sessionId);
            } else if (event.type === 'deleted') {
                this.unwatchSession(event.sessionId);
            }
            this.loadSessions();
        });

        this.loadSessions();
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === PERSISTED_SESSION_LIMIT_PREF || e.preferenceName === SESSION_STORAGE_PREF) {
                this.loadSessions();
            }
        });
    }

    isUnread(sessionId: string): boolean {
        return this.unreadSessions.get(sessionId)?.unread === true;
    }

    protected watchSession(session: ChatSession): void {
        if (this.unreadSessions.has(session.id)) {
            return;
        }
        const reqs = session.model.getRequests();
        const state = {
            unread: false,
            seenRequests: reqs.length,
            seenCompleted: this.countCompleted(reqs),
            listener: new DisposableCollection()
        };
        this.unreadSessions.set(session.id, state);

        session.model.onDidChange(() => {
            const current = session.model.getRequests();
            if (current.length > state.seenRequests || this.countCompleted(current) > state.seenCompleted) {
                const activeSession = this.chatService.getActiveSession();
                const chatViewFocused = ChatViewWidget.findActive(this.shell) !== undefined;
                if (chatViewFocused && activeSession && activeSession.id === session.id) {
                    state.seenRequests = current.length;
                    state.seenCompleted = this.countCompleted(current);
                } else if (!state.unread) {
                    state.unread = true;
                    this.onUnreadChangedEmitter.fire(session.id);
                }
            }
        }, undefined, state.listener);
    }

    protected markSessionRead(sessionId: string): void {
        const state = this.unreadSessions.get(sessionId);
        if (!state) {
            return;
        }
        const session = this.chatService.getSession(sessionId);
        const reqs = session?.model.getRequests() ?? [];
        state.seenRequests = reqs.length;
        state.seenCompleted = this.countCompleted(reqs);
        if (state.unread) {
            state.unread = false;
            this.onUnreadChangedEmitter.fire(sessionId);
        }
    }

    protected unwatchSession(sessionId: string): void {
        const state = this.unreadSessions.get(sessionId);
        if (state) {
            state.listener.dispose();
            this.unreadSessions.delete(sessionId);
        }
    }

    private countCompleted(reqs: ReturnType<ChatSession['model']['getRequests']>): number {
        return reqs.filter(r => r.response.isComplete).length;
    }

    isPersistenceEnabled(): boolean {
        const limit = this.preferenceService.get<number>(PERSISTED_SESSION_LIMIT_PREF, 25);
        return limit !== 0;
    }

    protected async loadSessions(): Promise<void> {
        if (!this.isPersistenceEnabled()) {
            this._persistedSessions = [];
            this.onStateChangedEmitter.fire();
            return;
        }

        const hasSessions = await this.chatService.hasPersistedSessions();
        if (!hasSessions) {
            this._persistedSessions = [];
            this.onStateChangedEmitter.fire();
            return;
        }

        try {
            const index = await this.chatService.getPersistedSessions();
            this._persistedSessions = Object.values(index)
                .toSorted((a, b) => b.saveDate - a.saveDate);
        } catch (error) {
            console.error('Failed to load persisted sessions:', error);
            this._persistedSessions = [];
        } finally {
            this.onStateChangedEmitter.fire();
        }
    }

    getSections(): SectionedSessions {
        const activeRaw = this.chatService.getSessions().filter(s => !!s.title);
        const activeIds = new Set(activeRaw.map(s => s.id));
        const active: ChatSessionMetadata[] = activeRaw
            .toSorted((a, b) => (b.lastInteraction?.getTime() ?? 0) - (a.lastInteraction?.getTime() ?? 0))
            .map(session => {
                const lastReq = session.model.getRequests().at(-1);
                const hasError = lastReq?.response.isComplete === true && lastReq?.response.isError === true;
                return {
                    sessionId: session.id,
                    title: session.title!,
                    saveDate: session.lastInteraction?.getTime() ?? Date.now(),
                    location: session.model.location,
                    pinnedAgentId: session.pinnedAgent?.id,
                    hasError
                };
            });
        const restored = this._persistedSessions.filter(metadata => !activeIds.has(metadata.sessionId));
        return { active, restored };
    }
}
