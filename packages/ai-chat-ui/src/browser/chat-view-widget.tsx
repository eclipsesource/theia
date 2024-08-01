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
import { ChatModel, ChatRequest, ChatService } from '@theia/ai-chat';
import { PREFERENCE_NAME_ENABLE_EXPERIMENTAL } from '@theia/ai-core/lib/browser/ai-core-preferences';
import { CommandService, deepClone, Emitter, Event, MessageService } from '@theia/core';
import { BaseWidget, codicon, Message, PanelLayout, PreferenceService, StatefulWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChatInputWidget } from './chat-input-widget';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget';

export namespace ChatViewWidget {
    export interface State {
        locked?: boolean;
    }
}

@injectable()
export class ChatViewWidget extends BaseWidget implements StatefulWidget {

    public static ID = 'chat-view-widget';
    static LABEL = `✨ ${nls.localizeByDefault('Chat')} [Experimental]`;

    @inject(ChatService)
    private chatService: ChatService;

    @inject(MessageService)
    private messageService: MessageService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    // TODO: handle multiple sessions
    private chatModel: ChatModel;

    protected _state: ChatViewWidget.State = { locked: false };
    protected readonly onStateChangedEmitter = new Emitter<ChatViewWidget.State>();

    constructor(
        @inject(ChatViewTreeWidget)
        readonly treeWidget: ChatViewTreeWidget,
        @inject(ChatInputWidget)
        readonly inputWidget: ChatInputWidget
    ) {
        super();
        this.id = ChatViewWidget.ID;
        this.title.label = ChatViewWidget.LABEL;
        this.title.caption = ChatViewWidget.LABEL;
        this.title.iconClass = codicon('comment-discussion');
        this.title.closable = true;
        this.node.classList.add('chat-view-widget');
        this.update();
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            this.treeWidget,
            this.inputWidget,
            this.onStateChanged(newState => {
                this.treeWidget.shouldScrollToEnd = !newState.locked;
                this.update();
            })
        ]);
        const layout = this.layout = new PanelLayout();

        // Experimental features are enabled
        this.treeWidget.node.classList.add('chat-tree-view-widget');
        layout.addWidget(this.treeWidget);
        this.inputWidget.node.classList.add('chat-input-widget');
        layout.addWidget(this.inputWidget);
        this.inputWidget.onQuery = this.onQuery.bind(this);
        this.inputWidget.setEnabled(false);
        // TODO restore sessions if needed
        this.chatModel = this.chatService.createSession();
        this.treeWidget.trackChatModel(this.chatModel);

        this.preferenceService.onPreferenceChanged(change => {
            if (change.preferenceName === PREFERENCE_NAME_ENABLE_EXPERIMENTAL) {
                this.treeWidget.setEnabled(change.newValue);
                this.inputWidget.setEnabled(change.newValue);
                this.update();
            }
        });
    }

    storeState(): object {
        return this.state;
    }

    restoreState(oldState: object & Partial<ChatViewWidget.State>): void {
        const copy = deepClone(this.state);
        if (oldState.locked) {
            copy.locked = oldState.locked;
        }
        this.state = copy;
    }

    protected get state(): ChatViewWidget.State {
        return this._state;
    }

    protected set state(state: ChatViewWidget.State) {
        this._state = state;
        this.onStateChangedEmitter.fire(this._state);
    }

    get onStateChanged(): Event<ChatViewWidget.State> {
        return this.onStateChangedEmitter.event;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
    }

    private async onQuery(query: string): Promise<void> {
        if (query.length === 0) { return; }
        // send query

        const chatRequest: ChatRequest = {
            text: query
        };

        const requestProgress = await this.chatService.sendRequest(this.chatModel.id,
            chatRequest,
            e => { if (e instanceof Error) { this.messageService.error(e.message); } else { throw e; } });
        if (!requestProgress) {
            this.messageService.error(`Was not able to send request "${chatRequest.text}" to session ${this.chatModel.id}`);
        }
        // Tree Widget currently tracks the ChatModel itself. Therefore no notification necessary.
    }

    lock(): void {
        this.state = { ...deepClone(this.state), locked: true };
    }

    unlock(): void {
        this.state = { ...deepClone(this.state), locked: false };
    }

    get isLocked(): boolean {
        return !!this.state.locked;
    }
}
