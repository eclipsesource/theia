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
import { PromptTemplate, LanguageModelSelector } from '@theia/ai-core';
import { ChatRequestModelImpl, COMMAND_CHAT_RESPONSE_COMMAND, CommandChatResponseContent, CommandChatResponseContentImpl } from './chat-model';
import { CommandRegistry, MessageService } from '@theia/core';

export class MockCommandChatAgentSystemPromptTemplate implements PromptTemplate {
    id = 'mock-command-chat-agent-system-prompt-template';
    template = `I
    am
    system
    prompt`;
}

interface ParsedCommand {
    type: 'theia-command' | 'custom-handler'
    commandId: string;
    arguments: string[];
}

@injectable()
export class MockCommandChatAgent implements ChatAgent {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(MessageService)
    private readonly messageService: MessageService;

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
        // TODO parse command from chat gpt
        const parsedCommand: ParsedCommand = {
            type: 'theia-command',
            commandId: 'theia-ai-prompt-template:show-prompts-command',
            arguments: []
        };

        let content: CommandChatResponseContent;
        if (parsedCommand.type === 'theia-command') {
            const theiaCommand = this.commandRegistry.getCommand(parsedCommand.commandId);
            if (theiaCommand === undefined) {
                console.error(`No Theia Command with id ${parsedCommand.commandId}`);
                request.response.cancel();
            }
            const args = parsedCommand.arguments.length > 0 ? parsedCommand.arguments : undefined;
            content = new CommandChatResponseContentImpl(theiaCommand, args);
        } else {
            const args = parsedCommand.arguments.length > 0 ? parsedCommand.arguments : undefined;
            content = new CommandChatResponseContentImpl(COMMAND_CHAT_RESPONSE_COMMAND, args, this.commandCallback);
        }

        request.response.response.addContent(content);
        request.response.complete();
    }

    protected async commandCallback(...commandArgs: unknown[]): Promise<void> {
        this.messageService.info(`Executing callback with args ${commandArgs.join(', ')}`, 'Got it');
    }

}
