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
import { ChatAgent, ChatServiceImpl, ParsedChatRequest } from '../common';
import { PreferenceService } from '@theia/core/lib/browser';
import { DEFAULT_CHAT_AGENT_PREF } from './ai-chat-preferences';

@injectable()
export class FrontendChatServiceImpl extends ChatServiceImpl {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    protected override getAgent(parsedRequest: ParsedChatRequest): ChatAgent | undefined {
        const agentPart = this.getMentionedAgent(parsedRequest);
        if (agentPart) {
            return this.chatAgentService.getAgent(agentPart.agent.id);
        }

        const configuredDefaultChatAgent = this.getConfiguredDefaultChatAgent();
        if (configuredDefaultChatAgent) {
            return configuredDefaultChatAgent;
        }

        if (this.defaultChatAgent) {
            return this.chatAgentService.getAgent(this.defaultChatAgent.id);
        }

        this.logger.warn('No default chat agent is configured. Falling back to first registered agent.');

        return this.chatAgentService.getAgents()[0] ?? undefined;
    }

    protected getConfiguredDefaultChatAgent(): ChatAgent | undefined {
        const configuredDefaultChatAgentId = this.preferenceService.get<string>(DEFAULT_CHAT_AGENT_PREF, undefined);
        const configuredDefaultChatAgent = configuredDefaultChatAgentId ? this.chatAgentService.getAgent(configuredDefaultChatAgentId) : undefined;
        if (configuredDefaultChatAgentId && !configuredDefaultChatAgent) {
            this.logger.warn(`The configured default chat agent with id '${configuredDefaultChatAgentId}' does not exist.`);
        }
        return configuredDefaultChatAgent;
    }
}
