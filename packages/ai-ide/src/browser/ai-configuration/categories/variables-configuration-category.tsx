// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { Agent, AgentService, AIVariable, AIVariableService } from '@theia/ai-core/lib/common';
import { Emitter, Event, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider,
    AiConfigurationTreeItem
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { CollectionCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/collection-category-renderer';
import { AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-section';
import { AiConfigurationItemDetailHeader } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-item-detail-header';

/**
 * The Variables category: a `collection` with a read-only per-item detail (description,
 * arguments, and the agents that use the variable, which navigate to the agent detail).
 */
@injectable()
export class VariablesConfigurationCategory extends CollectionCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.VARIABLES;
    readonly label = nls.localizeByDefault('Variables');
    readonly iconClass = codicon('symbol-variable');
    readonly order = AiConfigurationCategoryOrder.VARIABLES;
    readonly kind = 'collection' as const;

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.variableService.onDidChangeVariables(() => this.onDidChangeEmitter.fire()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected get categoryId(): string {
        return this.id;
    }

    protected getVariables(): AIVariable[] {
        return this.variableService.getVariables().sort((a, b) => a.name.localeCompare(b.name));
    }

    getTreeChildren(): AiConfigurationTreeItem[] {
        return this.getVariables().map(variable => ({
            id: variable.id,
            label: variable.name,
            iconClass: this.iconClass,
            description: variable.description
        } satisfies AiConfigurationTreeItem));
    }

    protected override renderItemHeader(item: AiConfigurationTreeItem): React.ReactNode {
        return <AiConfigurationItemDetailHeader
            title={item.label}
            iconClass={item.iconClass}
            subtitle={nls.localizeByDefault('Id: {0}', item.id)}
        />;
    }

    protected renderItemSections(item: AiConfigurationTreeItem, ctx: AiConfigurationRenderContext): React.ReactNode {
        const variable = this.getVariables().find(candidate => candidate.id === item.id);
        if (!variable) {
            return undefined;
        }
        return <>
            {variable.description && <div className='ai-variable-description'>{variable.description}</div>}
            {this.renderArgs(variable)}
            {this.renderUsedByAgents(variable, ctx)}
        </>;
    }

    protected renderArgs(variable: AIVariable): React.ReactNode {
        if (!variable.args || variable.args.length === 0) {
            return undefined;
        }
        return <AiConfigurationSection title={nls.localizeByDefault('Arguments')}>
            <table className='ai-templates-table'>
                <tbody>
                    {variable.args.map(arg => <tr key={arg.name}>
                        <td>{arg.name}</td>
                        <td>{arg.description}</td>
                    </tr>)}
                </tbody>
            </table>
        </AiConfigurationSection>;
    }

    protected renderUsedByAgents(variable: AIVariable, ctx: AiConfigurationRenderContext): React.ReactNode {
        const agents = this.getAgentsForVariable(variable);
        if (agents.length === 0) {
            return undefined;
        }
        return <AiConfigurationSection title={nls.localize('theia/ai/ide/variableConfiguration/usedByAgents', 'Used by Agents')}>
            <ul className='variable-agent-list'>
                {agents.map(agent => <li
                    key={agent.id}
                    className='variable-agent-item'
                    onClick={() => ctx.navigate({ categoryId: AiConfigurationCategoryId.AGENTS, itemId: agent.id })}
                >
                    <span>{agent.name}</span>
                    <i className={codicon('chevron-right')}></i>
                </li>)}
            </ul>
        </AiConfigurationSection>;
    }

    protected getAgentsForVariable(variable: AIVariable): Agent[] {
        return this.agentService.getAgents().filter(agent => agent.variables?.includes(variable.id));
    }

    protected override getEmptyMessage(): string {
        return nls.localize('theia/ai/ide/variableConfiguration/noVariables', 'No variables are available.');
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const typeLabel = nls.localizeByDefault('Variable');
        return this.getVariables().map(variable => ({
            label: variable.name,
            typeLabel,
            categoryId: this.id,
            target: { categoryId: this.id, itemId: variable.id },
            keywords: `${variable.id} ${variable.description ?? ''}`
        } satisfies AiConfigurationSearchItem));
    }
}
