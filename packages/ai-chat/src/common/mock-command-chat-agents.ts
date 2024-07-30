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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import {
    PromptTemplate, LanguageModelSelector, CommunicationRecordingService, LanguageModelRegistry, PromptService, LanguageModelRequestMessage, isLanguageModelStreamResponse
} from '@theia/ai-core';
import { ChatRequestModelImpl, CommandChatResponseContent, CommandChatResponseContentImpl } from './chat-model';
import { Command, CommandRegistry, MessageService, generateUuid } from '@theia/core';
import { getMessages } from './chat-util';

export class MockCommandChatAgentSystemPromptTemplate implements PromptTemplate {
    id = 'mock-command-chat-agent-system-prompt-template';
    template = `
# System Prompt

You are a service that returns one of the following command templates.

If a user asks for a theia command, or the context implies it is about a command in theia, return the template with "type": "theia-command"

Otherwise return the template with "type": "custom-handler"

The output format is JSON.

Your response only consists of one of the templates without any other text or modifications.

## Template 1

{
    "type": "theia-command",
    "commandId": "theia-ai-prompt-template:show-prompts-command"
}

## Template 2

{
    "type": "custom-handler",
    "commandId": "ai-chat.command-chat-response.generic",
    "arguments": ["hello", "world"]
}
    `;
}

interface ParsedCommand {
    type: 'theia-command' | 'custom-handler'
    commandId: string;
    arguments?: string[];
}

@injectable()
export class MockCommandChatAgent implements ChatAgent {

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(MessageService)
    private readonly messageService: MessageService;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    id: string = 'MockCommandChatAgent';
    name: string = 'Mock Command Chat Agent';
    description: string = 'The default chat agent provided by Theia responsible for providing commands.';
    variables: string[] = [];
    promptTemplates: PromptTemplate[] = [new MockCommandChatAgentSystemPromptTemplate()];
    languageModelRequirements: Omit<LanguageModelSelector, 'agent'>[] = [{
        purpose: 'command',
        identifier: 'openai/gpt-4o',
    }];
    locations: ChatAgentLocation[] = [];

    async invoke(request: ChatRequestModelImpl): Promise<void> {

        this.recordingService.recordRequest({
            agentId: this.id,
            sessionId: request.session.id,
            timestamp: Date.now(),
            requestId: request.id,
            request: request.request.text
        });
        const selector = this.languageModelRequirements.find(req => req.purpose === 'chat')!;
        const languageModels = await this.languageModelRegistry.selectLanguageModels({ agent: this.id, ...selector });
        if (languageModels.length === 0) {
            throw new Error('Couldn\'t find a language model. Please check your setup!');
        }

        const systemPrompt = await this.promptService.getPrompt('mock-command-chat-agent-system-prompt-template');
        if (systemPrompt === undefined) {
            throw new Error('Couldn\'t get system prompt ');
        }

        const prevMessages: LanguageModelRequestMessage[] = getMessages(request.session);

        // TODO do we want to include more messages?
        const messages: LanguageModelRequestMessage[] = prevMessages.length > 0 ? [prevMessages[prevMessages.length - 1]] : [];
        messages.unshift({
            actor: 'ai',
            type: 'text',
            query: systemPrompt
        });

        const languageModelResponse = await languageModels[0].request({ messages });

        let parsedCommand: ParsedCommand | undefined = undefined;
        // const parsedCommand: ParsedCommand = {
        //     type: 'theia-command',
        //     commandId: 'theia-ai-prompt-template:show-prompts-command',
        //     arguments: []
        // };
        if (isLanguageModelStreamResponse(languageModelResponse)) {
            const tokens: string[] = [];
            for await (const token of languageModelResponse.stream) {
                const tokenContent = token.content ?? '';
                tokens.push(tokenContent);

            }
            const jsonString = tokens.join('');
            parsedCommand = JSON.parse(jsonString) as ParsedCommand;

        } else {
            console.error('Unknown response type');
        }

        if (parsedCommand === undefined) {
            console.error('Could not parse response from Language Model');
            return;
        }

        let content: CommandChatResponseContent;
        if (parsedCommand.type === 'theia-command') {
            const theiaCommand = this.commandRegistry.getCommand(parsedCommand.commandId);
            if (theiaCommand === undefined) {
                console.error(`No Theia Command with id ${parsedCommand.commandId}`);
                request.response.cancel();
            }
            const args = parsedCommand.arguments !== undefined && parsedCommand.arguments.length > 0 ? parsedCommand.arguments : undefined;
            content = new CommandChatResponseContentImpl(theiaCommand, args);
        } else {
            const id = `ai-command-${generateUuid()}`;
            const command: Command = {
                id,
                label: 'AI Command'
            };

            const args = parsedCommand.arguments !== undefined && parsedCommand.arguments.length > 0 ? parsedCommand.arguments : undefined;
            this.commandRegistry.registerCommand(command, {
                execute: () => {
                    const fullArgs: unknown[] = [id];
                    if (args !== undefined) {
                        fullArgs.push(...args);
                    }
                    this.commandCallback(fullArgs);
                }
            });
            content = new CommandChatResponseContentImpl(command, args, this.commandCallback);
        }

        request.response.response.addContent(content);
        request.response.complete();
    }

    protected async commandCallback(...commandArgs: unknown[]): Promise<void> {
        this.messageService.info(`Executing callback with args ${commandArgs.join(', ')}`, 'Got it');
    }

}
