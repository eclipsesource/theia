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

import { Agent } from '@theia/ai-core/lib/common';
import { bindContributionProvider } from '@theia/core';
import { PreferenceContribution } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    ChatAgent,
    ChatAgentService,
    ChatAgentServiceImpl,
    ChatRequestParser,
    ChatRequestParserImpl,
    ChatService,
    DefaultChatAgentId
} from '../common';
import { CommandChatAgent } from '../common/command-chat-agents';
import { DelegatingChatAgent } from '../common/delegating-chat-agent';
import { UniversalChatAgent } from '../common/universal-chat-agent';
import { aiChatPreferences } from './ai-chat-preferences';
import { FrontendChatServiceImpl } from './frontend-chat-service';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, Agent);
    bindContributionProvider(bind, ChatAgent);

    bind(ChatAgentServiceImpl).toSelf().inSingletonScope();
    bind(ChatAgentService).toService(ChatAgentServiceImpl);
    bind(DefaultChatAgentId).toConstantValue({ id: 'DelegatingChatAgent' });

    bind(ChatRequestParserImpl).toSelf().inSingletonScope();
    bind(ChatRequestParser).toService(ChatRequestParserImpl);

    bind(FrontendChatServiceImpl).toSelf().inSingletonScope();
    bind(ChatService).toService(FrontendChatServiceImpl);

    bind(DelegatingChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(DelegatingChatAgent);
    bind(ChatAgent).toService(DelegatingChatAgent);

    bind(UniversalChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(UniversalChatAgent);
    bind(ChatAgent).toService(UniversalChatAgent);

    bind(CommandChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(CommandChatAgent);
    bind(ChatAgent).toService(CommandChatAgent);

    bind(PreferenceContribution).toConstantValue({ schema: aiChatPreferences });
});
