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

import { ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { Agent, AIVariable, AIVariableService } from '../../common';
import { ContributionProvider } from '@theia/core';

@injectable()
export class AIVariableConfiguratioContainerWidget extends ReactWidget {

    static readonly ID = 'ai-variable-configuration-container-widget';
    static readonly LABEL = 'Variables';

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(ContributionProvider) @named(Agent)
    protected readonly agents: ContributionProvider<Agent>;

    @postConstruct()
    protected init(): void {
        this.id = AIVariableConfiguratioContainerWidget.ID;
        this.title.label = AIVariableConfiguratioContainerWidget.LABEL;
        this.title.closable = false;
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='configuration-variables-list'>
            <ul>
                {this.variableService.getVariables().map(variable =>
                    <li className='variable-item'>
                        <span>{variable.name}</span>
                        <small>{variable.description}</small>
                        {this.renderReferencedVariables(variable)}
                    </li>
                )}
            </ul>
        </div>
    }

    protected renderReferencedVariables(variable: AIVariable): React.ReactNode | undefined {
        const agents = this.getAgentsForVariable(variable);
        if (agents.length === 0) {
            return;
        }

        return <ul>
            {agents.map(a => <li>{a.name}</li>)}
        </ul>
    }

    protected getAgentsForVariable(variable: AIVariable): Agent[] {
        return this.agents.getContributions().filter(a => a.variables?.includes(variable.id));
    }
}
