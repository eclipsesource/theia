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
import { AiConfigurationFilterInput } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-filter-input';
import { AiConfigurationEmptyState } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-empty-state';

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

    /** The prompt reference used to insert the variable, e.g. `#file`. */
    protected getVariableReference(variable: AIVariable): string {
        return `${PromptText.VARIABLE_CHAR}${variable.name}`;
    }

    /**
     * Case-insensitive match of a variable against the filter query, testing both the variable name
     * and its description. An empty (or whitespace-only) query matches everything.
     */
    matchesVariable(variable: AIVariable, query: string): boolean {
        const needle = query.trim().toLocaleLowerCase();
        if (!needle) {
            return true;
        }
        const haystack = `${variable.name} ${variable.description ?? ''}`.toLocaleLowerCase();
        return haystack.includes(needle);
    }

    protected buildRow(variable: AIVariable, usage: VariableAgentUsage[]): VariableRowModel {
        return {
            variable,
            reference: this.getVariableReference(variable),
            description: variable.description ?? '',
            agents: this.getAgentsForVariable(variable, usage)
        };
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
        const usage = this.computeAgentUsage();
        const groups: VariableGroupModel[] = [
            {
                id: 'context',
                title: nls.localize('theia/ai/ide/variableConfiguration/contextGroup', 'Context Variables'),
                rows: variables.filter(variable => variable.isContextVariable).map(variable => this.buildRow(variable, usage))
            },
            {
                id: 'other',
                title: nls.localize('theia/ai/ide/variableConfiguration/plainGroup', 'Other Variables'),
                rows: variables.filter(variable => !variable.isContextVariable).map(variable => this.buildRow(variable, usage))
            }
        ];
        return <VariableListView
            groups={groups}
            matches={(variable, query) => this.matchesVariable(variable, query)}
            onOpenAgent={agentId => ctx.navigate({ categoryId: AiConfigurationCategoryId.AGENTS, itemId: agentId })}
        />;
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

    /** Localized `(total)` / `(matching of total)` count suffix shown next to a group header. */
    static formatGroupCount(matching: number, total: number, filtering: boolean): string {
        return filtering
            ? nls.localizeByDefault('{0} of {1}', matching, total)
            : `${total}`;
    }

    /** Maximum number of agent chips rendered inline on a row before the rest collapse into an overflow chip. */
    static readonly MAX_VISIBLE_AGENT_CHIPS = 3;

    /** Splits an agent list into the chips shown inline and those hidden behind the `+N` overflow chip. */
    static splitAgents(agents: Agent[]): { visible: Agent[]; overflow: Agent[] } {
        if (agents.length <= VariablesConfigurationCategory.MAX_VISIBLE_AGENT_CHIPS) {
            return { visible: agents, overflow: [] };
        }
        return {
            visible: agents.slice(0, VariablesConfigurationCategory.MAX_VISIBLE_AGENT_CHIPS),
            overflow: agents.slice(VariablesConfigurationCategory.MAX_VISIBLE_AGENT_CHIPS)
        };
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

/** Presentation model for a single variable row, prepared by the category and rendered by the view. */
interface VariableRowModel {
    readonly variable: AIVariable;
    /** The prompt reference, e.g. `#file`. */
    readonly reference: string;
    readonly description: string;
    readonly agents: Agent[];
}

/** One titled group of variable rows (e.g. "Context Variables"). */
interface VariableGroupModel {
    readonly id: string;
    readonly title: string;
    readonly rows: VariableRowModel[];
}

interface VariableListViewProps {
    readonly groups: VariableGroupModel[];
    readonly matches: (variable: AIVariable, query: string) => boolean;
    readonly onOpenAgent: (agentId: string) => void;
}

/**
 * The interactive variables list: owns the local filter and per-row expansion state so both reset
 * when the user navigates away from and back to the Variables page (the component unmounts).
 */
const VariableListView: React.FC<VariableListViewProps> = ({ groups, matches, onOpenAgent }) => {
    const [filter, setFilter] = React.useState('');
    const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set<string>());
    const toggle = React.useCallback((id: string) => setExpanded(previous => {
        const next = new Set(previous);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        return next;
    }), []);

    const query = filter.trim();
    const filtering = query.length > 0;
    const visibleGroups = groups
        .map(group => ({ group, matching: filtering ? group.rows.filter(row => matches(row.variable, query)) : group.rows }))
        .filter(entry => entry.matching.length > 0);

    return <div className='ai-variable-list'>
        <AiConfigurationFilterInput
            value={filter}
            onChange={setFilter}
            placeholder={nls.localize('theia/ai/ide/variableConfiguration/filterPlaceholder', 'Filter variables by name or description')}
        />
        {visibleGroups.length === 0
            ? <AiConfigurationEmptyState
                iconClass={codicon('search')}
                message={filtering
                    ? nls.localize('theia/ai/ide/variableConfiguration/noMatches', 'No variables match "{0}".', query)
                    : nls.localize('theia/ai/ide/variableConfiguration/noVariables', 'No variables are available.')}
            />
            : visibleGroups.map(({ group, matching }) => <VariableGroup
                key={group.id}
                title={group.title}
                count={VariablesConfigurationCategory.formatGroupCount(matching.length, group.rows.length, filtering)}
                rows={matching}
                expanded={expanded}
                onToggle={toggle}
                onOpenAgent={onOpenAgent}
            />)}
    </div>;
};

interface VariableGroupProps {
    readonly title: string;
    readonly count: string;
    readonly rows: VariableRowModel[];
    readonly expanded: ReadonlySet<string>;
    readonly onToggle: (id: string) => void;
    readonly onOpenAgent: (agentId: string) => void;
}

const VariableGroup: React.FC<VariableGroupProps> = ({ title, count, rows, expanded, onToggle, onOpenAgent }) =>
    <div className='ai-variable-group'>
        <h3 className='section-header'>
            {title} <span className='ai-variable-group-count'>({count})</span>
        </h3>
        {rows.map(row => <VariableRow
            key={row.variable.id}
            row={row}
            expanded={expanded.has(row.variable.id)}
            onToggle={onToggle}
            onOpenAgent={onOpenAgent}
        />)}
    </div>;

interface VariableRowProps {
    readonly row: VariableRowModel;
    readonly expanded: boolean;
    readonly onToggle: (id: string) => void;
    readonly onOpenAgent: (agentId: string) => void;
}

const VariableRow: React.FC<VariableRowProps> = ({ row, expanded, onToggle, onOpenAgent }) => {
    const { variable, reference, description, agents } = row;
    const argCount = variable.args?.length ?? 0;
    return <div className='ai-variable-row' data-ai-config-row-id={variable.id}>
        <div className={`ai-variable-row-header ${expanded ? 'expanded' : ''}`} onClick={() => onToggle(variable.id)}>
            <div className='ai-variable-row-title'>
                <span aria-hidden='true' className={`ai-variable-expansion-icon ${codicon(expanded ? 'chevron-down' : 'chevron-right')}`}></span>
                <span className='ai-variable-name'>{reference}</span>
                <span className='ai-variable-inline-description'>{description}</span>
                {argCount > 0 && <span className='ai-variable-arg-hint'>
                    {argCount === 1
                        ? nls.localize('theia/ai/ide/variableConfiguration/argCountSingular', '1 argument')
                        : nls.localize('theia/ai/ide/variableConfiguration/argCountPlural', '{0} arguments', argCount)}
                </span>}
            </div>
            {agents.length > 0 && <AgentChips agents={agents} onOpenAgent={onOpenAgent} />}
        </div>
        {expanded && <div className='ai-variable-row-body'>
            {description && <div className='ai-variable-full-description'>{description}</div>}
            <div className='ai-variable-meta'>
                <span className='ai-variable-meta-entry'>
                    {nls.localizeByDefault('Reference')}: <code>{reference}</code>
                </span>
                <span className='ai-variable-meta-entry'>
                    {nls.localize('theia/ai/ide/variableConfiguration/idLabel', 'Id')}: <code>{variable.id}</code>
                </span>
            </div>
            <VariableArgs variable={variable} />
        </div>}
    </div>;
};

const VariableArgs: React.FC<{ variable: AIVariable }> = ({ variable }) => {
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
};

interface AgentChipsProps {
    readonly agents: Agent[];
    readonly onOpenAgent: (agentId: string) => void;
}

const AgentChips: React.FC<AgentChipsProps> = ({ agents, onOpenAgent }) => {
    const { visible, overflow } = VariablesConfigurationCategory.splitAgents(agents);
    return <div className='agent-chips-container'>
        {visible.map(agent => <AgentChip key={agent.id} agent={agent} onOpenAgent={onOpenAgent} />)}
        {overflow.length > 0 && <AgentOverflowChip overflow={overflow} onOpenAgent={onOpenAgent} />}
    </div>;
};

const AgentChip: React.FC<{ agent: Agent; onOpenAgent: (agentId: string) => void }> = ({ agent, onOpenAgent }) => {
    const label = nls.localize('theia/ai/ide/variableConfiguration/openAgent', 'Open agent {0}', agent.name);
    return <button
        type='button'
        className='agent-chip'
        aria-label={label}
        title={label}
        onClick={event => {
            event.stopPropagation();
            onOpenAgent(agent.id);
        }}
    >
        {agent.name}
    </button>;
};

/**
 * The `+N` chip that reveals the remaining agents in a small popover. The popover closes on outside
 * click and on Escape (restoring focus to the trigger), and moves keyboard focus onto its first item
 * when opened.
 */
const AgentOverflowChip: React.FC<{ overflow: Agent[]; onOpenAgent: (agentId: string) => void }> = ({ overflow, onOpenAgent }) => {
    const [open, setOpen] = React.useState(false);
    // eslint-disable-next-line no-null/no-null
    const containerRef = React.useRef<HTMLDivElement>(null);
    // eslint-disable-next-line no-null/no-null
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    // eslint-disable-next-line no-null/no-null
    const popoverRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) {
            return;
        }
        const onDocumentPointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onDocumentKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', onDocumentPointerDown);
        document.addEventListener('keydown', onDocumentKeyDown);
        popoverRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
        return () => {
            document.removeEventListener('mousedown', onDocumentPointerDown);
            document.removeEventListener('keydown', onDocumentKeyDown);
        };
    }, [open]);

    const label = nls.localize('theia/ai/ide/variableConfiguration/moreAgents', 'Show {0} more agents', overflow.length);
    return <div className='ai-variable-agent-overflow' ref={containerRef}>
        <button
            ref={triggerRef}
            type='button'
            className='agent-chip ai-variable-agent-overflow-trigger'
            aria-haspopup='true'
            aria-expanded={open}
            aria-label={label}
            title={label}
            onClick={event => {
                event.stopPropagation();
                setOpen(value => !value);
            }}
        >
            +{overflow.length}
        </button>
        {open && <div className='ai-variable-agent-popover' role='menu' ref={popoverRef}>
            {overflow.map(agent => <button
                key={agent.id}
                type='button'
                role='menuitem'
                className='ai-variable-agent-popover-item'
                onClick={event => {
                    event.stopPropagation();
                    onOpenAgent(agent.id);
                    setOpen(false);
                }}
            >
                {agent.name}
            </button>)}
        </div>}
    </div>;
};
