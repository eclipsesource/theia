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

import { ContributionProvider } from '@theia/core';
import { ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { Agent, AIVariable, AIVariableService } from '../../common';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import { AIAgentConfigurationWidget } from './agent-configuration-widget';

@injectable()
export class AIVariableConfigurationWidget extends ReactWidget {

    static readonly ID = 'ai-variable-configuration-container-widget';
    static readonly LABEL = 'Variables';

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(ContributionProvider) @named(Agent)
    protected readonly agents: ContributionProvider<Agent>;

    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;

    @postConstruct()
    protected init(): void {
        this.id = AIVariableConfigurationWidget.ID;
        this.title.label = AIVariableConfigurationWidget.LABEL;
        this.title.closable = false;
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='configuration-variables-list'>
            <ul>
                {this.variableService.getVariables().map(variable =>
                    <li className='variable-item'>
                        <strong>{variable.name}</strong>
                        <small>{variable.description}</small>
                        {this.renderReferencedVariables(variable)}
                    </li>
                )}
            </ul>
        </div>;
    }

    protected renderReferencedVariables(variable: AIVariable): React.ReactNode | undefined {
        const agents = this.getAgentsForVariable(variable);
        if (agents.length === 0) {
            return;
        }

        return <ul className='variable-used-agents'>
            {agents.map(agent => <li><a onClick={() => { this.showAgentConfiguration(agent) }}>{agent.name}</a></li>)}
        </ul>;
    }

    protected showAgentConfiguration(agent: Agent): void {
        this.aiConfigurationSelectionService.setActiveAgent(agent);
        this.aiConfigurationSelectionService.selectConfigurationTab(AIAgentConfigurationWidget.ID);
    }

    protected getAgentsForVariable(variable: AIVariable): Agent[] {
        return this.agents.getContributions().filter(a => a.variables?.includes(variable.id));
    }
}

