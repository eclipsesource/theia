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

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgentService, ChatService, ChatAgentLocation, MutableChatRequestModel } from '@theia/ai-chat/lib/common';
import { AGENT_DELEGATION_FUNCTION_ID } from '../common/workspace-functions';

@injectable()
export class AgentDelegationTool implements ToolProvider {
    static ID = AGENT_DELEGATION_FUNCTION_ID;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    getTool(): ToolRequest {
        return {
            id: AgentDelegationTool.ID,
            name: AgentDelegationTool.ID,
            description: 'Delegate a task or question to a specific AI agent. This tool allows you to route requests to specialized agents based on their capabilities.',
            parameters: {
                type: 'object',
                properties: {
                    agentName: {
                        type: 'string',
                        description: 'The name/ID of the AI agent to delegate the task to. Available agents can be found using the chatAgents variable.'
                    },
                    prompt: {
                        type: 'string',
                        description: 'The task, question, or prompt to pass to the specified agent.'
                    }
                },
                required: ['agentName', 'prompt']
            },
            handler: (arg_string: string, ctx: MutableChatRequestModel) => this.delegateToAgent(arg_string, ctx)
        };
    }

    private async delegateToAgent(arg_string: string, ctx: MutableChatRequestModel): Promise<string> {
        try {

            // console.log('[DELEGATE] CTX = ' + JSON.stringify(ctx));

            const args = JSON.parse(arg_string);
            const { agentName, prompt } = args;

            if (!agentName || !prompt) {
                return JSON.stringify({
                    error: 'Both agentName and prompt parameters are required.'
                });
            }

            // Check if the specified agent exists
            const agent = this.chatAgentService.getAgent(agentName);
            if (!agent) {
                const availableAgents = this.chatAgentService.getAgents().map(a => a.id);
                return JSON.stringify({
                    error: `Agent '${agentName}' not found or not enabled.`,
                    availableAgents: availableAgents
                });
            }

            // Create a new session
            const newSession = this.chatService.createSession(ChatAgentLocation.Panel, { focus: false }, agent);

            // Send the request
            const response = await this.chatService.sendRequest(newSession.id, prompt);

            // ctx.response.response.addContent(new DelegateResponseContent(response));

            if (response) {
                await response.responseCompleted;
            } else {
                // TODO Properly handle error case
                return 'delegation has failed';
            }

            // Return the response as a string
            return 'success';
        } catch (error) {
            console.error('Failed to delegate to agent', error);
            return JSON.stringify({
                error: `Failed to parse arguments or delegate to agent: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }
    }
}
