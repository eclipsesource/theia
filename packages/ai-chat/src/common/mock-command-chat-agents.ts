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
    PromptTemplate,
    LanguageModelSelector,
    CommunicationRecordingService,
    LanguageModelRegistry,
    PromptService,
    LanguageModelRequestMessage,
    isLanguageModelStreamResponse,
} from '@theia/ai-core';
import {
    ChatRequestModelImpl,
    ChatResponseContent,
    CommandChatResponseContentImpl,
    HorizontalLayoutChatResponseContentImpl,
    MarkdownChatResponseContentImpl,
} from './chat-model';
import {
    Command,
    CommandRegistry,
    MessageService,
    generateUuid,
} from '@theia/core';
import { getMessages } from './chat-util';

export class MockCommandChatAgentSystemPromptTemplate implements PromptTemplate {
    id = 'mock-command-chat-agent-system-prompt-template';
    template = `# System Prompt

You are a service that helps users finding commands to execute in an IDE.
You reply stringified JSON Objects that tell the user which command to execute and arguments, if any. 

# Examples

The examples start with a short explanation of the return object. 
The response can be found within the markdown \`\`\`json and \`\`\` markers.
Please also include this markers in the reply

Never under any circumstances you may reply with just the command-id!

## Example 1

This reply is to tell the user to execute the \`theia-ai-prompt-template:show-prompts-command\` command that is available in the theia command registry.

\`\`\`json
{
    "type": "theia-command",
    "commandId": "theia-ai-prompt-template:show-prompts-command"
}
\`\`\`

## Example 2

This reply is for custom commands, that are not registered in the theia command registry. 
These commands always have the command id \`ai-chat.command-chat-response.generic\`.
The arguments are an array and may differ, but this depends on the instructions of the user. 

\`\`\`json
{
    "type": "custom-handler",
    "commandId": "ai-chat.command-chat-response.generic",
    "arguments": ["hello", "world"]
}
\`\`\`

## Example 3

This reply of type no-command is for cases where you can't find a proper command. 
You may use the message to explain the situation to the user.

\`\`\`json
{
    "type": "no-command",
    "message": "a message explaining what is wrong"
}
\`\`\`

# Rules

## Theia Commands

If a user asks for a theia command, or the context implies it is about a command in theia, return a response with "type": "theia-command"
You need to exchange the "commandId". 
The available command ids in Theia are in the list below. The list of commands is formatted like this:

command-id1: Label1
command-id2: Label2
command-id3: 
command-id4: Label4

The Labels may be empty, but there is always a command-id.

I want you to suggest a command that probably fits with the users message based on the label and the command ids you know. 
If you have multiple commands that fit, return the one that fits best. We only want a single command in the reply.
If the user says that the last command was not right, try to return the next best fit, based on the conversation history with the user.

If there are no more command ids that seem to fit, return a response of "type": "no-command" explaining the situation

Here are the known Theia commands:

Begin List:
\${command-ids}
End List:

## Custom handlers

If the user asks for a command that is not a theia command, return a response with "type": "custom-handler"

## Other cases

In all other cases return a reply of "type": "no-command"

# Examples for invalid responses

## Invalid Response Example 1

This example is invalid because it return text + two commands. 
It is instructed that only one command has to be replied. ANd it has to be parseable json.

### The example

Yes, there are a few more theme-related commands. Here is another one:

\`\`\`json
{
    "type": "theia-command",
    "commandId": "workbench.action.selectIconTheme"
}
\`\`\`

And another one:

\`\`\`json
{
    "type": "theia-command",
    "commandId": "workbench.action.toggleHighContrast"
}
\`\`\`

## Invalid Response Example 2

The following example is invalid because it only return the command id and is not parseable json:

### The example

workbench.action.selectIconTheme

## Invalid Response Example 3

The following example is invalid because it returns a message with the command id. We need JSON objects based on above rules.
Do not respond like this in any case! We need a command of "type": "theia-command",
The expected response would be:
\`\`\`json
{
    "type": "theia-command",
    "commandId": "workbench.action.toggleHighContrast"
}
\`\`\`

### The example

I found this command that might help you: workbench.action.toggleHighContrast

## Invalid Response Example 4

The following example is invalid because it has an explanation string before the json. 
We only want the JSON!

### The example

You can toggle high contrast mode with this command:

\`\`\`json
{
    "type": "theia-command",
    "commandId": "editor.action.toggleHighContrast"
}
\`\`\`

## Invalid Response Example 5

The following example is wrong, because it explains that no command was found. 
We want to the a response of type "no-command" and have the message there.

### The example

There is no specific command available to "open the windows" in the provided Theia command list.
`;
}

interface ParsedCommand {
    type: 'theia-command' | 'custom-handler' | 'no-command'
    commandId: string;
    arguments?: string[];
    message?: string;
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
            const maybeJsonString = tokens.join('');

            const jsonMatch = maybeJsonString.match(/(\{[\s\S]*\})/);
            const jsonString = jsonMatch ? jsonMatch[1] : `{
    "type": "no-command",
    "message": "Sorry, I'm having problems at the moment. Please try again."
}`;

            parsedCommand = JSON.parse(jsonString) as ParsedCommand;

        } else {
            console.error('Unknown response type');
        }

        if (parsedCommand === undefined) {
            console.error('Could not parse response from Language Model');
            return;
        }

        let content: ChatResponseContent;
        if (parsedCommand.type === 'theia-command') {
            const theiaCommand = this.commandRegistry.getCommand(parsedCommand.commandId);
            if (theiaCommand === undefined) {
                console.error(`No Theia Command with id ${parsedCommand.commandId}`);
                request.response.cancel();
            }
            const args =
                parsedCommand.arguments !== undefined &&
                    parsedCommand.arguments.length > 0
                    ? parsedCommand.arguments
                    : undefined;

            content = new HorizontalLayoutChatResponseContentImpl([
                new MarkdownChatResponseContentImpl(
                    'I found this command that might help you:'
                ),
                new CommandChatResponseContentImpl(theiaCommand, args),
            ]);
        } else if (parsedCommand.type === 'custom-handler') {
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
            content = new HorizontalLayoutChatResponseContentImpl([
                new MarkdownChatResponseContentImpl(
                    'Try executing this:'
                ),
                new CommandChatResponseContentImpl(command, args, this.commandCallback),
            ]);
        } else {
            content = new MarkdownChatResponseContentImpl(parsedCommand.message ?? 'Sorry, I can\'t find such a command');
        }

        request.response.response.addContent(content);
        request.response.complete();
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId: request.session.id,
            timestamp: Date.now(),
            requestId: request.response.requestId,
            response: request.response.response.asString()
        });
    }

    protected async commandCallback(...commandArgs: unknown[]): Promise<void> {
        this.messageService.info(`Executing callback with args ${commandArgs.join(', ')}. The first arg is the command id registered for the dynamically registered command. 
        The other args are the actual args for the handler.`, 'Got it');
    }

}
