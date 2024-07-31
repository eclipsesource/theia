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
import * as React from '@theia/core/shared/react';
import { LanguageModel } from '../../common';
import { Agent } from '../../common/agent';
import { PromptCustomizationService } from '../../common/prompt-service';
import { LanguageModelRenderer } from './language-model-renderer';
import { TemplateRenderer } from './template-settings-renderer';

export interface AgentProps {
    agent: Agent;
    promptCustomizationService: PromptCustomizationService;
    languageModels?: LanguageModel[];
}

export const AgentRenderer: React.FC<AgentProps> = ({ agent, promptCustomizationService, languageModels }) => <div>
    <div key={agent.id}>
        <h2>{agent.name}</h2>
        <h2>{agent.description}</h2>
        <div className='ai-templates'>
            {agent.promptTemplates.map(template =>
                <TemplateRenderer
                    key={agent.id + '.' + template.id}
                    agentId={agent.id}
                    template={template}
                    promptCustomizationService={promptCustomizationService}
                />)}
        </div>
        <div className='ai-lm-requirements'>
            {agent.languageModelRequirements.map(value =>
                <LanguageModelRenderer
                    key={agent.id + '.' + value.identifier}
                    agentId={agent.id}
                    selectedModels={new Map()}
                    selectedPurposes={new Map()}
                    languageModels={languageModels}
                />
            )}
        </div>
    </div>
</div>;
