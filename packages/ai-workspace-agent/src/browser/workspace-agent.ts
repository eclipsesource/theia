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
import { AbstractStreamParsingChatAgent, SystemMessage } from '@theia/ai-chat/lib/common';
import { FunctionCallRegistry, LanguageModelRequirement } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { template } from '../common/template';

@injectable()
export class WorkspaceAgent extends AbstractStreamParsingChatAgent {
    id = 'Workspace';
    name = 'Workspace Agent';
    description = `This agent can access the workspace and thus can answer
questions about projects, project files, and source code in the workspace, such as building the project,
finding out what this project is about, or how to implement certain aspects of based on the project code.
`;
    promptTemplates = [template];
    override variables = [];

    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }];

    protected override languageModelPurpose = 'chat';

    @inject(FunctionCallRegistry)
    protected functionCallRegistry: FunctionCallRegistry;

    protected override async getSystemMessage(): Promise<SystemMessage | undefined> {
        const resolvedPrompt = await this.promptService.getPrompt(template.id);
        return resolvedPrompt ? SystemMessage.fromResolvedPromptTemplate(resolvedPrompt) : undefined;
    }
}