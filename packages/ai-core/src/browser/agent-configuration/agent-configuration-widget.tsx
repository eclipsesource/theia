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
import { Agent } from '../../common';

@injectable()
export class AIAgentConfigurationContainerWidget extends ReactWidget {

    static readonly ID = 'ai-agent-configuration-container-widget';
    static readonly LABEL = 'Agents';

    @inject(ContributionProvider) @named(Agent)
    protected readonly agents: ContributionProvider<Agent>;

    protected selectedAgent?: Agent;

    @postConstruct()
    protected init(): void {
        this.id = AIAgentConfigurationContainerWidget.ID;
        this.title.label = AIAgentConfigurationContainerWidget.LABEL;
        this.title.closable = false;
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='ai-agent-configuration-main'>
            <div className='configuration-agents-list'>
                <ul>
                    {this.agents.getContributions().map(agent =>
                        <li onClick={() => this.selectAgent(agent)}>{agent.name}</li>
                    )}
                </ul>
            </div>
            <div className='configuration-agent-panel'>
                Hello {this.selectedAgent?.name}
            </div>
        </div>
    }


    protected selectAgent(agent: Agent): void {
        this.selectedAgent = agent;
        this.update();
    }

}
