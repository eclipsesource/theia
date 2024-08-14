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

import {
    LanguageModel,
    LanguageModelParsedResponse,
    LanguageModelRequest,
    LanguageModelRequestMessage,
    LanguageModelResponse,
    LanguageModelStreamResponsePart
} from '@theia/ai-core';
import OpenAI from 'openai';
import { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { RunnableToolFunctionWithoutParse } from 'openai/lib/RunnableFunction';
import { ChatCompletionMessageParam } from 'openai/resources';

export const OpenAiModelIdentifier = Symbol('OpenAiModelIdentifier');

export class OpenAiModel implements LanguageModel {

    readonly providerId = 'openai';
    readonly vendor: string = 'OpenAI';

    constructor(protected readonly model: string, protected apiKey: () => string | undefined) {
    }

    get id(): string {
        return this.providerId + '/' + this.model;
    }

    get name(): string {
        return this.model;
    }

    async request(request: LanguageModelRequest): Promise<LanguageModelResponse> {
        const openai = this.initializeOpenAi();

        if (request.response_format?.type === 'json_schema') {
            return this.handleStructuredOutputRequest(openai, request);
        }

        let runner: ChatCompletionStream;
        const tools = this.createTools(request);
        if (tools) {
            runner = openai.beta.chat.completions.runTools({
                model: this.model,
                messages: request.messages.map(this.toOpenAIMessage),
                stream: true,
                tools: tools,
                tool_choice: 'auto',
                ...request.settings
            });
        } else {
            runner = openai.beta.chat.completions.stream({
                model: this.model,
                messages: request.messages.map(this.toOpenAIMessage),
                stream: true,
                ...request.settings
            });
        }
        request.cancellationToken?.onCancellationRequested(() => {
            runner.abort();
        });

        let runnerEnd = false;

        let resolve: (part: LanguageModelStreamResponsePart) => void;
        runner.on('error', error => {
            console.error('Error in OpenAI chat completion stream:', error);
            runnerEnd = true;
            resolve({ content: error.message });
        });
        runner.on('message', message => {
            if (message.role === 'tool') {
                resolve({ tool_calls: [{ id: message.tool_call_id, finished: true, result: this.getCompletionContent(message) }] });
            }
            console.debug('Received Open AI message', JSON.stringify(message));
        });
        runner.once('end', () => {
            runnerEnd = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve(runner.finalChatCompletion as any);
        });
        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                runner.on('chunk', chunk => {
                    if (chunk.choices[0]?.delta) {
                        resolve({ ...chunk.choices[0]?.delta });
                    }
                });
                while (!runnerEnd) {
                    const promise = new Promise<LanguageModelStreamResponsePart>((res, rej) => {
                        resolve = res;
                    });
                    yield promise;
                }
            }
        };
        return { stream: asyncIterator };
    }

    protected async handleStructuredOutputRequest(openai: OpenAI, request: LanguageModelRequest): Promise<LanguageModelParsedResponse> {
        // TODO implement tool support for structured output (parse() seems to require different tool format)
        const result = await openai.beta.chat.completions.parse({
            model: this.model,
            messages: request.messages.map(this.toOpenAIMessage),
            response_format: request.response_format,
            ...request.settings
        });
        const message = result.choices[0].message;
        if (message.refusal || message.parsed === undefined) {
            console.error('Error in OpenAI chat completion stream:', JSON.stringify(message));
        }
        return {
            content: message.content ?? '',
            parsed: message.parsed
        };
    }

    private getCompletionContent(message: OpenAI.Chat.Completions.ChatCompletionToolMessageParam): string {
        if (Array.isArray(message.content)) {
            return message.content.join('');
        }
        return message.content;
    }

    protected createTools(request: LanguageModelRequest): RunnableToolFunctionWithoutParse[] | undefined {
        return request.tools?.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
                function: (args_string: string) => tool.handler(args_string)
            }
        } as RunnableToolFunctionWithoutParse));
    }

    protected initializeOpenAi(): OpenAI {
        const key = this.apiKey();
        if (!key) {
            throw new Error('Please provide OPENAI_API_KEY in preferences or via environment variable');
        }
        return new OpenAI({ apiKey: key });
    }

    private toOpenAIMessage(message: LanguageModelRequestMessage): ChatCompletionMessageParam {
        if (message.actor === 'ai') {
            return { role: 'assistant', content: message.query || '' };
        }
        if (message.actor === 'user') {
            return { role: 'user', content: message.query || '' };
        }
        if (message.actor === 'system') {
            return { role: 'system', content: message.query || '' };
        }
        return { role: 'system', content: '' };
    }

}
