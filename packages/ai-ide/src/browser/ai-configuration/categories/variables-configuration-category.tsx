// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
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
import { AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-section';

/**
 * The Variables category: a `single-page` category that renders every variable as a flat,
 * expandable list rather than a tree of nodes with per-item detail pages. Each row shows the
 * variable reference, a one-line description and count pills for its arguments and the agents
 * that use it at a glance; expanding a row reveals the full description, its id, its arguments
 * and the agents that use it as chips. Variables are read-only, so a dedicated detail page per
 * item would be more navigation than the payload warrants.
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

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

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
        const haystack = `${variable.name} ${VariablesConfigurationCategory.normalizeDescription(variable.description)}`.toLocaleLowerCase();
        return haystack.includes(needle);
    }

    protected buildRow(variable: AIVariable, usage: VariableAgentUsage[]): VariableRowModel {
        return {
            variable,
            reference: this.getVariableReference(variable),
            description: VariablesConfigurationCategory.normalizeDescription(variable.description),
            agents: this.getAgentsForVariable(variable, usage),
            argCount: variable.args?.length ?? 0
        };
    }

    /** Copies the variable's prompt reference (e.g. `#file`) to the clipboard. */
    protected copyReference(variable: AIVariable): void {
        this.clipboardService.writeText(this.getVariableReference(variable));
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
                description: nls.localize(
                    'theia/ai/ide/variableConfiguration/contextGroupDescription',
                    'Referenced with {0}name in a prompt and also attachable to a request as context that the agent and its tools can inspect.',
                    PromptText.VARIABLE_CHAR
                ),
                rows: variables.filter(variable => variable.isContextVariable).map(variable => this.buildRow(variable, usage))
            },
            {
                id: 'plain',
                title: nls.localize('theia/ai/ide/variableConfiguration/plainGroup', 'Plain Variables'),
                description: nls.localize(
                    'theia/ai/ide/variableConfiguration/plainGroupDescription',
                    'Referenced with {0}name in a prompt and resolved inline to a text value at request time.',
                    PromptText.VARIABLE_CHAR
                ),
                rows: variables.filter(variable => !variable.isContextVariable).map(variable => this.buildRow(variable, usage))
            }
        ];
        return <VariableListView
            groups={groups}
            matches={(variable, query) => this.matchesVariable(variable, query)}
            onOpenAgent={agentId => ctx.navigate({ categoryId: AiConfigurationCategoryId.AGENTS, itemId: agentId })}
            onCopyReference={variable => this.copyReference(variable)}
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

    /**
     * Trims and collapses internal whitespace in a description. Descriptions are contributed by
     * third-party extensions, so they may contain runs of whitespace from indented template literals.
     */
    static normalizeDescription(text?: string): string {
        return (text ?? '').replace(/\s+/g, ' ').trim();
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
    readonly argCount: number;
}

/** One titled group of variable rows (e.g. "Context Variables"). */
interface VariableGroupModel {
    readonly id: string;
    readonly title: string;
    /** One-line explanation of what distinguishes this kind of variable. */
    readonly description: string;
    readonly rows: VariableRowModel[];
}

interface VariableListViewProps {
    readonly groups: VariableGroupModel[];
    readonly matches: (variable: AIVariable, query: string) => boolean;
    readonly onOpenAgent: (agentId: string) => void;
    readonly onCopyReference: (variable: AIVariable) => void;
}

/**
 * The interactive variables list: owns the local filter and per-row expansion state so both reset
 * when the user navigates away from and back to the Variables page (the component unmounts).
 */
const VariableListView: React.FC<VariableListViewProps> = ({ groups, matches, onOpenAgent, onCopyReference }) => {
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
            : <div className='ai-configuration-sections'>
                {visibleGroups.map(({ group, matching }) => <VariableGroup
                    key={group.id}
                    title={group.title}
                    description={group.description}
                    rows={matching}
                    expanded={expanded}
                    onToggle={toggle}
                    onOpenAgent={onOpenAgent}
                    onCopyReference={onCopyReference}
                />)}
            </div>}
    </div>;
};

interface VariableGroupProps {
    readonly title: string;
    readonly description: string;
    readonly rows: VariableRowModel[];
    readonly expanded: ReadonlySet<string>;
    readonly onToggle: (id: string) => void;
    readonly onOpenAgent: (agentId: string) => void;
    readonly onCopyReference: (variable: AIVariable) => void;
}

const VariableGroup: React.FC<VariableGroupProps> = ({ title, description, rows, expanded, onToggle, onOpenAgent, onCopyReference }) =>
    <AiConfigurationSection title={title} className='ai-variable-group'>
        <div className='ai-variable-group-description'>{description}</div>
        {rows.map(row => <VariableRow
            key={row.variable.id}
            row={row}
            expanded={expanded.has(row.variable.id)}
            onToggle={onToggle}
            onOpenAgent={onOpenAgent}
            onCopyReference={onCopyReference}
        />)}
    </AiConfigurationSection>;

interface VariableRowProps {
    readonly row: VariableRowModel;
    readonly expanded: boolean;
    readonly onToggle: (id: string) => void;
    readonly onOpenAgent: (agentId: string) => void;
    readonly onCopyReference: (variable: AIVariable) => void;
}

const VariableRow: React.FC<VariableRowProps> = ({ row, expanded, onToggle, onOpenAgent, onCopyReference }) => {
    const { variable, reference, description, agents, argCount } = row;
    const argCountLabel = argCount === 1
        ? nls.localize('theia/ai/ide/variableConfiguration/argCountSingular', '1 argument')
        : nls.localize('theia/ai/ide/variableConfiguration/argCountPlural', '{0} arguments', argCount);
    const agentCountLabel = agents.length === 1
        ? nls.localizeByDefault('1 agent')
        : nls.localizeByDefault('{0} agents', agents.length);
    const bodyId = `ai-variable-body-${variable.id}`;
    const toggle = React.useCallback(() => onToggle(variable.id), [onToggle, variable.id]);
    // Only toggle when the header itself has focus; keystrokes on nested controls (copy button) must not
    // bubble up and collapse the row.
    const onHeaderKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            toggle();
        }
    }, [toggle]);
    return <div className='ai-variable-row' data-ai-config-row-id={variable.id}>
        {/* The whole header is the disclosure control (role="button"); clicking anywhere but the copy
            button toggles the row. The copy button stops propagation so it never toggles expansion. */}
        <div
            className={`ai-variable-row-header ${expanded ? 'expanded' : ''}`}
            role='button'
            tabIndex={0}
            aria-expanded={expanded}
            aria-controls={expanded ? bodyId : undefined}
            onClick={toggle}
            onKeyDown={onHeaderKeyDown}
        >
            <span aria-hidden='true' className={`ai-variable-expansion-icon ${codicon(expanded ? 'chevron-down' : 'chevron-right')}`}></span>
            <span className='ai-variable-name'>{reference}</span>
            <CopyReferenceButton onCopy={() => onCopyReference(variable)} />
            {/* The full description reads in the header only while collapsed (single line + tooltip). When
                expanded it moves into the body as a wrapping paragraph, leaving an empty flex spacer here so
                the name and pills keep their positions and the header height doesn't jump. */}
            {expanded
                ? <span className='ai-variable-inline-description-spacer' aria-hidden='true'></span>
                : <span className='ai-variable-inline-description' title={description || undefined}>{description}</span>}
            <div className='ai-variable-row-meta'>
                {argCount > 0 && <span className='ai-variable-count-pill'>{argCountLabel}</span>}
                {agents.length > 0 && <span className='ai-variable-count-pill'>{agentCountLabel}</span>}
            </div>
        </div>
        {expanded && <div className='ai-variable-row-body' id={bodyId}>
            {description && <p className='ai-variable-full-description'>{description}</p>}
            <div className='ai-variable-id-row'>
                <span className='ai-variable-id-label'>{nls.localizeByDefault('ID')}</span>
                <code className='ai-variable-id-value'>{variable.id}</code>
            </div>
            {argCount > 0 && <VariableArgs variable={variable} />}
            {agents.length > 0 && <UsedByAgents agents={agents} onOpenAgent={onOpenAgent} />}
        </div>}
    </div>;
};

/** A copy-to-clipboard affordance for the variable reference, briefly swapping to a check on success. */
const CopyReferenceButton: React.FC<{ onCopy: () => void }> = ({ onCopy }) => {
    const [copied, setCopied] = React.useState(false);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    React.useEffect(() => () => {
        if (timeoutRef.current !== undefined) {
            clearTimeout(timeoutRef.current);
        }
    }, []);
    const label = nls.localize('theia/ai/ide/variableConfiguration/copyVariableName', 'Copy variable name');
    return <button
        type='button'
        className='ai-variable-copy-button'
        aria-label={label}
        title={label}
        onClick={event => {
            event.stopPropagation();
            onCopy();
            setCopied(true);
            if (timeoutRef.current !== undefined) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => setCopied(false), 1500);
        }}
    >
        <span aria-hidden='true' className={codicon(copied ? 'check' : 'copy')}></span>
        {/* Announce the copy to assistive tech; the region is always present so the change is spoken. */}
        <span className='ai-variable-visually-hidden' aria-live='polite'>{copied ? nls.localizeByDefault('Copied') : ''}</span>
    </button>;
};

const VariableArgs: React.FC<{ variable: AIVariable }> = ({ variable }) => {
    if (!variable.args || variable.args.length === 0) {
        return undefined;
    }
    return <div className='ai-variable-section'>
        <div className='ai-variable-section-label'>{nls.localizeByDefault('Arguments')}</div>
        <div className='ai-variable-args-container'>
            {variable.args.map(arg => <div key={arg.name} className='ai-variable-arg-row'>
                <code className='ai-variable-arg-name'>{arg.name}</code>
                <span className={`ai-variable-arg-badge ${arg.isOptional ? 'optional' : 'required'}`}>
                    {arg.isOptional
                        ? nls.localize('theia/ai/ide/variableConfiguration/optional', 'optional')
                        : nls.localize('theia/ai/ide/variableConfiguration/required', 'required')}
                </span>
                <div className='ai-variable-arg-description'>
                    {VariablesConfigurationCategory.normalizeDescription(arg.description)}
                    {arg.enum && arg.enum.length > 0 && <span className='ai-variable-arg-enum'>
                        {nls.localize('theia/ai/ide/variableConfiguration/argEnum', 'One of: {0}', arg.enum.join(', '))}
                    </span>}
                </div>
            </div>)}
        </div>
    </div>;
};

/** The agents that reference the variable, rendered as navigable chips. */
const UsedByAgents: React.FC<{ agents: Agent[]; onOpenAgent: (agentId: string) => void }> = ({ agents, onOpenAgent }) =>
    <div className='ai-variable-section'>
        <div className='ai-variable-section-label'>{nls.localize('theia/ai/ide/variableConfiguration/usedByAgents', 'Used by agents')}</div>
        <div className='ai-variable-agent-chips'>
            {agents.map(agent => <AgentChip key={agent.id} agent={agent} onOpenAgent={onOpenAgent} />)}
        </div>
    </div>;

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
        <span aria-hidden='true' className={codicon('hubot')}></span>
        {agent.name}
    </button>;
};
