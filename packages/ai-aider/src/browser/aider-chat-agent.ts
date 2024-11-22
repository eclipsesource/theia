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
    ChatAgent,
    ChatAgentLocation,
    ChatAgentService,
    ChatRequestModelImpl,
    ChatResponseContent,
    QuestionChatResponseContentImpl,
    ToolCallChatResponseContentImpl
} from '@theia/ai-chat/lib/common';
import { PromptTemplate, AgentSpecificVariables, LanguageModelRequirement } from '@theia/ai-core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { AiderConnector, AiderConnectorClient } from '../common/api';
import { CancellationTokenSource, ContributionProvider } from '@theia/core';
import { findFirstMatch, parseContents } from '@theia/ai-chat/lib/common/parse-contents';
import { DefaultResponseContentFactory, ResponseContentMatcher, ResponseContentMatcherProvider } from '@theia/ai-chat/lib/common/response-content-matcher';

@injectable()
export class AiderChatAgent implements ChatAgent {

    @inject(AiderConnector)
    protected aiderConnector: AiderConnector;
    @inject(AiderConnectorClient)
    protected aiderConnectorClient: AiderConnectorClient;
    @inject(DefaultResponseContentFactory)
    protected defaultContentFactory: DefaultResponseContentFactory;
    @inject(ContributionProvider) @named(ResponseContentMatcherProvider)
    protected contentMatcherProviders: ContributionProvider<ResponseContentMatcherProvider>;
    protected contentMatchers: ResponseContentMatcher[] = [];

    readonly name: string;
    readonly description: string;
    readonly variables: string[];
    readonly promptTemplates: PromptTemplate[];
    readonly agentSpecificVariables: AgentSpecificVariables[];
    readonly functions: string[];
    readonly locations: ChatAgentLocation[];
    readonly iconClass?: string | undefined;
    readonly id: string;
    readonly languageModelRequirements: LanguageModelRequirement[];
    readonly tags?: string[];
    constructor() {
        this.id = 'Aider';
        this.name = 'Aider';
        this.description = 'This is a chat agent helping with coding.';
        this.promptTemplates = [];
        this.variables = [];
        this.agentSpecificVariables = [];
        this.functions = [];
        this.iconClass = 'codicon codicon-copilot';
        this.locations = ChatAgentLocation.ALL;
        this.tags = ['Chat'];
        this.languageModelRequirements = [];
    }

    @postConstruct()
    protected initialize(): void {
        this.contentMatchers = this.contentMatcherProviders.getContributions().flatMap(provider => provider.matchers);

        this.aiderConnectorClient.onAiderMessage(message => {
            {
                if (this.currentCancellationToken?.token.isCancellationRequested) {
                    this.currentRequest?.response.complete();
                    return;
                }
                if (message === '$END_REQUEST$') {
                    this.requestRunning = false;
                }
                if (!this.requestRunning) {
                    if (this.currentRequest) {
                        this.currentRequest.response.complete();
                    }
                    this.currentCancellationToken = undefined;
                    this.currentRequest = undefined;
                }
                if (this.requestRunning) {
                    if (typeof message !== 'string') {
                        const type = message.type;
                        switch (type) {
                            case 'question': {
                                this.currentRequest?.response.response.addContent(
                                    new QuestionChatResponseContentImpl
                                        (message.subject ? `${message.subject} ${message.text}` : message.text,
                                            this.currentRequest.session.id,
                                            message.options,
                                            this.currentRequest.agentId
                                        )
                                );
                                break;
                            }
                            case 'progress': {
                                this.currentRequest?.response.response.addContent(
                                    new ToolCallChatResponseContentImpl(message.text, message.text, undefined, message.done, 'Repo Scanned')
                                );
                                break;
                            }
                            default: {
                                this.addDefaultContent(message.text);
                                // this.currentRequest?.response.response.addContent(new MarkdownChatResponseContentImpl(message.text));
                            }
                        }
                        return;
                    }
                    this.addDefaultContent(message);
                    // this.currentRequest?.response.response.addContent(new MarkdownChatResponseContentImpl(message));

                }
            }
        });
    }
    private addDefaultContent(message: string): void {
        const newContents = this.defaultContentFactory.create(message);
        this.currentRequest?.response.response.addContent(newContents);
        const lastContent = this.currentRequest?.response.response.content.pop();
        if (lastContent === undefined) {
            return;
        }
        const text = lastContent.asString?.();
        if (text === undefined) {
            return;
        }
        const result: ChatResponseContent[] = findFirstMatch(this.contentMatchers, text) ? parseContents(
            text,
            this.contentMatchers,
            this.defaultContentFactory?.create.bind(this.defaultContentFactory)
        ) : [];
        if (result.length > 0) {
            this.currentRequest?.response.response.addContents(result);
        } else {
            this.currentRequest?.response.response.addContent(lastContent);
        }
    }

    private currentCancellationToken?: CancellationTokenSource;
    private currentRequest?: ChatRequestModelImpl;
    private requestRunning: boolean = false;

    async invoke(request: ChatRequestModelImpl, chatAgentService?: ChatAgentService | undefined): Promise<void> {
        const cancellationToken = new CancellationTokenSource();
        this.currentCancellationToken = cancellationToken;
        this.currentRequest = request;

        request.response.onDidChange(() => {
            if (request.response.isCanceled) {
                cancellationToken.cancel();
            }
        });
        this.requestRunning = true;
        const message = request.message.parts.filter(p => p.kind === 'text').map(p => p.text).join('\n');
        await this.aiderConnector.sendMessage(message.trim());
    }
}
