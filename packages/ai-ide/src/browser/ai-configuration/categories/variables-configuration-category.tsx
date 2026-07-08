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

import { Agent, AgentService, AIVariable, AIVariableService, matchVariablesRegEx, PromptText } from '@theia/ai-core/lib/common';
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
    AiConfigurationSearchProvider
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';
import { AiConfigurationItemDetailHeader } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-item-detail-header';

/**
 * The Variables category: a `single-page` category that renders every variable as a flat,
 * expandable list rather than a tree of nodes with per-item detail pages. Each row shows the
 * variable reference, a one-line description and the agents that use it (as chips) at a glance;
 * expanding a row reveals the full description, its id and its arguments. Variables are read-only,
 * so a dedicated detail page per item would be more navigation than the payload warrants.
 */
@injectable()
export class VariablesConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.VARIABLES;
    readonly label = nls.localizeByDefault('Variables');
    readonly iconClass = codicon('symbol-variable');
    readonly order = AiConfigurationCategoryOrder.VARIABLES;
    readonly kind = 'single-page' as const;

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    /** Ids of the variables whose detail is currently expanded in the list. */
    protected readonly expandedVariableIds = new Set<string>();

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            this.variableService.onDidChangeVariables(() => this.onDidChangeEmitter.fire()),
            this.agentService.onDidChangeAgents(() => this.onDidChangeEmitter.fire())
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected getVariables(): AIVariable[] {
        return this.variableService.getVariables().sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Computes, per agent, which variables it uses: those explicitly declared in {@link Agent.variables}
     * (matched by id) plus those referenced in its prompt templates as `{{name}}` (matched by name).
     * Declared globals are rarely populated in practice, so the prompt-template references are the
     * signal that actually surfaces the "used by" chips.
     */
    protected computeAgentUsage(): VariableAgentUsage[] {
        return this.agentService.getAllAgents()
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(agent => ({
                agent,
                declaredIds: new Set(agent.variables ?? []),
                referencedNames: this.getReferencedVariableNames(agent)
            }));
    }

    /** Variable names referenced as `{{name}}` (or `{{name:arg}}`) across the agent's prompt templates. */
    protected getReferencedVariableNames(agent: Agent): Set<string> {
        const names = new Set<string>();
        for (const promptVariantSet of agent.prompts ?? []) {
            const fragments = [promptVariantSet.defaultVariant, ...(promptVariantSet.variants ?? [])];
            for (const fragment of fragments) {
                if (!fragment?.template) {
                    continue;
                }
                for (const match of matchVariablesRegEx(fragment.template)) {
                    const name = match[1].split(PromptText.VARIABLE_SEPARATOR_CHAR, 2)[0].trim();
                    if (name) {
                        names.add(name);
                    }
                }
            }
        }
        return names;
    }

    protected getAgentsForVariable(variable: AIVariable, usage: VariableAgentUsage[]): Agent[] {
        return usage
            .filter(entry => entry.declaredIds.has(variable.id) || entry.referencedNames.has(variable.name))
            .map(entry => entry.agent);
    }

    protected toggleExpansion(variableId: string): void {
        if (this.expandedVariableIds.has(variableId)) {
            this.expandedVariableIds.delete(variableId);
        } else {
            this.expandedVariableIds.add(variableId);
        }
        this.onDidChangeEmitter.fire();
    }

    protected override renderHeader(): React.ReactNode {
        return <AiConfigurationItemDetailHeader
            title={this.label}
            iconClass={this.iconClass}
            subtitle={nls.localize(
                'theia/ai/ide/variableConfiguration/pageSubtitle',
                'Values you can reference with {0}name in a prompt. They are resolved and inserted at request time.',
                PromptText.VARIABLE_CHAR
            )}
        />;
    }

    protected renderSections(ctx: AiConfigurationRenderContext): React.ReactNode {
        const variables = this.getVariables();
        if (variables.length === 0) {
            return <div className='ai-empty-state-message'>
                {nls.localize('theia/ai/ide/variableConfiguration/noVariables', 'No variables are available.')}
            </div>;
        }
        const contextVariables = variables.filter(variable => variable.isContextVariable);
        const plainVariables = variables.filter(variable => !variable.isContextVariable);
        const usage = this.computeAgentUsage();
        return <div className='ai-variable-list'>
            {this.renderGroup(nls.localize('theia/ai/ide/variableConfiguration/contextGroup', 'Context Variables'), contextVariables, usage, ctx)}
            {this.renderGroup(nls.localize('theia/ai/ide/variableConfiguration/plainGroup', 'Other Variables'), plainVariables, usage, ctx)}
        </div>;
    }

    protected renderGroup(title: string, variables: AIVariable[], usage: VariableAgentUsage[], ctx: AiConfigurationRenderContext): React.ReactNode {
        if (variables.length === 0) {
            return undefined;
        }
        return <div className='ai-variable-group'>
            <h3 className='section-header'>{title}</h3>
            {variables.map(variable => this.renderVariableRow(variable, usage, ctx))}
        </div>;
    }

    protected renderVariableRow(variable: AIVariable, usage: VariableAgentUsage[], ctx: AiConfigurationRenderContext): React.ReactNode {
        const expanded = this.expandedVariableIds.has(variable.id);
        const agents = this.getAgentsForVariable(variable, usage);
        const argCount = variable.args?.length ?? 0;
        return <div className='ai-variable-row' key={variable.id} data-ai-config-row-id={variable.id}>
            <div
                className={`ai-variable-row-header ${expanded ? 'expanded' : ''}`}
                onClick={() => this.toggleExpansion(variable.id)}
            >
                <div className='ai-variable-row-title'>
                    <span className={`ai-variable-expansion-icon ${codicon(expanded ? 'chevron-down' : 'chevron-right')}`}></span>
                    <span className='ai-variable-name'>{PromptText.VARIABLE_CHAR}{variable.name}</span>
                    <span className='ai-variable-inline-description'>{variable.description}</span>
                    {argCount > 0 && <span className='ai-variable-arg-hint'>
                        {argCount === 1
                            ? nls.localize('theia/ai/ide/variableConfiguration/argCountSingular', '1 argument')
                            : nls.localize('theia/ai/ide/variableConfiguration/argCountPlural', '{0} arguments', argCount)}
                    </span>}
                </div>
                {agents.length > 0 && <div className='agent-chips-container'>
                    {agents.map(agent => <span
                        key={agent.id}
                        className='agent-chip'
                        title={nls.localize('theia/ai/ide/variableConfiguration/usedByAgentTitle', 'Used by agent: {0} (click to open)', agent.name)}
                        onClick={event => {
                            event.stopPropagation();
                            ctx.navigate({ categoryId: AiConfigurationCategoryId.AGENTS, itemId: agent.id });
                        }}
                    >
                        <span className={codicon('copilot')}></span>
                        {agent.name}
                    </span>)}
                </div>}
            </div>
            {expanded && <div className='ai-variable-row-body'>
                {variable.description && <div className='ai-variable-full-description'>{variable.description}</div>}
                <div className='ai-variable-meta'>
                    <span className='ai-variable-meta-entry'>
                        {nls.localizeByDefault('Reference')}: <code>{PromptText.VARIABLE_CHAR}{variable.name}</code>
                    </span>
                    <span className='ai-variable-meta-entry'>
                        {nls.localize('theia/ai/ide/variableConfiguration/idLabel', 'Id')}: <code>{variable.id}</code>
                    </span>
                </div>
                {this.renderArgs(variable)}
            </div>}
        </div>;
    }

    protected renderArgs(variable: AIVariable): React.ReactNode {
        if (!variable.args || variable.args.length === 0) {
            return undefined;
        }
        return <div className='ai-variable-args'>
            <div className='ai-variable-args-title'>{nls.localizeByDefault('Arguments')}</div>
            <table className='ai-templates-table'>
                <tbody>
                    {variable.args.map(arg => <tr key={arg.name}>
                        <td className='ai-variable-arg-name'>
                            <code>{arg.name}</code>
                            {arg.isOptional && <span className='ai-variable-arg-optional'>
                                {nls.localize('theia/ai/ide/variableConfiguration/optional', 'optional')}
                            </span>}
                        </td>
                        <td>
                            {arg.description}
                            {arg.enum && arg.enum.length > 0 && <span className='ai-variable-arg-enum'>
                                {nls.localize('theia/ai/ide/variableConfiguration/argEnum', 'One of: {0}', arg.enum.join(', '))}
                            </span>}
                        </td>
                    </tr>)}
                </tbody>
            </table>
        </div>;
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const typeLabel = nls.localizeByDefault('Variable');
        return this.getVariables().map(variable => ({
            label: variable.name,
            typeLabel,
            categoryId: this.id,
            target: { categoryId: this.id, highlight: { rowId: variable.id } },
            keywords: `${variable.id} ${variable.description ?? ''}`
        } satisfies AiConfigurationSearchItem));
    }
}

/** An agent together with the variables it uses, resolved once per render. */
interface VariableAgentUsage {
    readonly agent: Agent;
    /** Ids of variables the agent explicitly declares in {@link Agent.variables}. */
    readonly declaredIds: Set<string>;
    /** Names of variables the agent references in its prompt templates. */
    readonly referencedNames: Set<string>;
}
