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

import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatRequest, ChatResponseContent, ChatService, QuestionChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';

@injectable()
export class MyQuestionPartRenderer implements ChatResponsePartRenderer<QuestionChatResponseContent> {
    @inject(ChatService)
    protected chatService: ChatService;

    canHandle(response: ChatResponseContent): number {
        if (QuestionChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }
    render(response: QuestionChatResponseContent): ReactNode {
        return <div className="theia-MyQuestionPartRenderer-root">
            {response.content}
            <div className="theia-MyQuestionPartRenderer-answers">
                {response.options?.map(option =>
                    <div
                        className='theia-button theia-MyQuestionPartRenderer-answer-button'
                        title={option}
                        role='button'
                        onClick={() => { this.sendAnswer(option, response.sessionId, response.agentId); }}
                    >
                        {this.capitalizeFirstLetter(option)}
                    </div>
                )}
            </div>
        </div>;
    }

    private capitalizeFirstLetter(text: string): string {
        if (!text) { return text; } // Handle empty strings or falsy values
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    private sendAnswer(answer: string, sessionId: string, agentId?: string): void {
        const agentPrefix = agentId ? `@${agentId} ` : '';
        const chatRequest: ChatRequest = {
            text: agentPrefix + answer
        };
        this.chatService.sendRequest(sessionId, chatRequest);
    }
}
