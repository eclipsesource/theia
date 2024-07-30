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
import { ChatAgent, ChatMessage, ChatModel, ChatRequestParser, DefaultChatAgent } from '@theia/ai-chat/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { template } from '../common/template';
import { PromptService } from '@theia/ai-core';

@injectable()
export class TheiaWorkspaceAgent extends DefaultChatAgent implements ChatAgent {
    override id = 'TheiaWorkspaceAgent';
    override name = 'Workspace Agent';
    override description = 'An AI Agent that can access the current Theia Workspace contents';
    override promptTemplates = [template];

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(ChatRequestParser)
    protected chatRequestParser: ChatRequestParser;

    protected override async getMessages(model: ChatModel, includeResponseInProgress = false, systemMessage?: string): Promise<ChatMessage[]> {
        const system = systemMessage ?? await this.promptService.getPrompt(template.id);
        return super.getMessages(model, includeResponseInProgress, system);
    }
}
