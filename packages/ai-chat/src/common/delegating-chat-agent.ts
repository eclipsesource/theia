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

import { getJsonOfResponse, LanguageModelRequirement, LanguageModelResponse } from '@theia/ai-core';
import {
    PromptTemplate
} from '@theia/ai-core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgentService } from './chat-agent-service';
import { AbstractStreamParsingChatAgent, SystemMessage } from './chat-agents';
import { ChatRequestModelImpl, InformationalChatResponseContentImpl } from './chat-model';

export const delegateTemplate: PromptTemplate = {
    id: 'default-delegate-template',
    template: `# Instructions

Your task is to identify which Chat Agent(s) should best reply a given user's message.
You consider all messages of the conversation to ensure consistency and avoid agent switches without a clear context change.
You should select the best Chat Agent based on the name and description of the agents, matching them to the user message.

## Constraints

Your response must be a JSON array containing the id(s) of the selected Chat Agent(s).

* Do not use ids that are not provided in the list below.
* Do not include any additional information, explanations, or questions for the user.
* If there is no suitable choice, pick the \`Coding\`.
* If there are multiple good choices, return all of them.

Unless there is a more specific agent available, select the \`Coding\`, especially for general programming-related questions.
You must only use the \`id\` attribute of the agent, never the name.

### Example Results

\`\`\`json
["Coding"]
\`\`\`

\`\`\`json
["AnotherChatAgent", "Coding"]
\`\`\`

## List of Currently Available Chat Agents

\${agents}

`
};

@injectable()
export class DelegatingChatAgent extends AbstractStreamParsingChatAgent {
    id: string = 'DelegatingChatAgent';
    name: string = 'DelegatingChatAgent';
    description: string = 'A chat agent that analyzes the user request and the available chat agents' +
        ' to choose and delegate to the best fitting agent for answering the user request.';

    override iconClass = 'codicon codicon-symbol-boolean';

    variables: string[] = ['agents'];
    promptTemplates: PromptTemplate[] = [delegateTemplate];

    languageModelPurpose = 'agent-selection';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: this.languageModelPurpose,
        identifier: 'openai/gpt-4o',
    }];

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    override invoke(request: ChatRequestModelImpl): Promise<void> {
        request.response.addProgressMessage({ content: 'Determining the most appropriate agent', status: 'inProgress' });
        return super.invoke(request);
    }

    protected async getSystemMessage(): Promise<SystemMessage | undefined> {
        const resolvedPrompt = await this.promptService.getPrompt(delegateTemplate.id);
        return resolvedPrompt ? SystemMessage.fromResolvedPromptTemplate(resolvedPrompt) : undefined;
    }

    protected override async addContentsToResponse(response: LanguageModelResponse, request: ChatRequestModelImpl): Promise<void> {
        let agentIds = [];
        try {
            const jsonResponse = await getJsonOfResponse(response);
            if (Array.isArray(jsonResponse)) {
                agentIds = jsonResponse.filter((id: string) => id !== this.id);
            }
        } catch (error: unknown) {
            // The llm sometimes does not return a parseable result
            this.logger.error('Failed to parse JSON response', error);
        }

        if (agentIds.length < 1) {
            this.logger.error('No agent was selected, delegating to default chat agent');
            request.response.progressMessages.forEach(progressMessage =>
                request.response.updateProgressMessage({ ...progressMessage, status: 'failed' })
            );
            agentIds = ['Coding'];
        }
        // TODO support delegating to more than one agent
        const delegatedToAgent = agentIds[0];
        request.response.response.addContent(new InformationalChatResponseContentImpl(
            `*DelegatingChatAgent*: Delegating to \`@${delegatedToAgent}\`
            
            ---

            `
        ));
        request.response.overrideAgentId(delegatedToAgent);
        request.response.progressMessages.forEach(progressMessage =>
            request.response.updateProgressMessage({ ...progressMessage, status: 'completed' })
        );
        await this.chatAgentService.invokeAgent(delegatedToAgent, request);
    }
}
