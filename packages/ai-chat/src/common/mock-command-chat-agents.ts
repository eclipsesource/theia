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
    template = `# System Prompt

You are a service that returns replies just like the templates below. The reply needs to be parseable JSON, so it should start with { and end with }

If a user asks for a theia command, or the context implies it is about a command in theia, return a response based on the template with "type": "theia-command"
You need to exchange the "commandId". 
The available command ids in Theia are in the list below. The list of format like this:

command-id1: Label1
command-id2: Label2
command-id3: 
command-id4: Label4

The Labels may be empty, but there is always a command-id

I want you to suggest a command that probably fits with the users message based on the label and the command ids you know. 
If the user says that the last command was not right, try to return the next best fit, based on the conversation history with the user.

Begin List:
\${command-ids}
End List:

If the user asks for a command that is not a theia command, return the template with "type": "custom-handler"

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

        const knownCommands: string[] = [];
        for (const command of this.commandRegistry.getAllCommands()) {
            knownCommands.push(`${command.id}: ${command.label}`);
        }

        // eslint-disable-next-line @typescript-eslint/await-thenable
        const systemPrompt = await this.promptService.getPrompt('mock-command-chat-agent-system-prompt-template', {
            'command-ids': knownCommands.join('\n')
        });
        if (systemPrompt === undefined) {
            throw new Error('Couldn\'t get system prompt ');
        }

        const prevMessages: LanguageModelRequestMessage[] = getMessages(request.session);
        const messages = [...prevMessages];
        messages.unshift({
            actor: 'ai',
            type: 'text',
            query: systemPrompt
        });

        const languageModelResponse = await languageModels[0].request({ messages });

        let parsedCommand: ParsedCommand | undefined = undefined;

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
        this.messageService.info(`Executing callback with args ${commandArgs.join(', ')}. The first arg is the command id registered for the dynamically registered command. 
        The other args are the actual args for the handler.`, 'Got it');
    }

}
