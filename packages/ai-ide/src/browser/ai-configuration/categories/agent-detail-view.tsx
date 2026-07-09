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

import {
    Agent,
    AgentService,
    AISettingsService,
    AIVariableService,
    FrontendLanguageModelRegistry,
    LanguageModel,
    matchVariablesRegEx,
    PROMPT_FUNCTION_REGEX,
    ParsedCapability,
    parseCapabilitiesFromTemplate,
    PromptService,
    NotificationType,
    PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE,
    GenericCapabilitySelections,
    CAPABILITY_TYPE_PROMPT_MAP,
} from '@theia/ai-core/lib/common';
import { LanguageModelAlias } from '@theia/ai-core/lib/common/language-model-alias';
import { isChatAgent } from '@theia/ai-chat/lib/common';
import { nls } from '@theia/core';
import { CommonCommands } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common/command';
import * as React from '@theia/core/shared/react';
import { AiConfigurationItemDetailHeader } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-item-detail-header';
import { AiToggleSwitch } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';
import { LanguageModelRenderer } from '../language-model-renderer';
import { PromptVariantRenderer } from '../template-settings-renderer';
import { AgentNotificationSettings } from '../components/agent-notification-settings';
import { getAgentIconClass } from '../agent-icon';

/** The services the {@link AgentDetailView} needs; injected into the owning category and passed down. */
export interface AgentDetailServices {
    readonly agentService: AgentService;
    readonly aiSettingsService: AISettingsService;
    readonly variableService: AIVariableService;
    readonly promptService: PromptService;
    readonly languageModelRegistry: FrontendLanguageModelRegistry;
    readonly commandService: CommandService;
}

interface ParsedPrompt {
    functions: string[];
    globalVariables: string[];
    agentSpecificVariables: string[];
    capabilities: ParsedCapability[];
}

interface AgentDetailState {
    parsed: ParsedPrompt;
    showInChat: boolean;
    completionNotification?: NotificationType;
    capabilityOverrides?: Record<string, boolean>;
    genericCapabilitySelections?: GenericCapabilitySelections;
}

export interface AgentDetailViewProps {
    readonly agent: Agent;
    readonly services: AgentDetailServices;
    /** Category-wide model/alias caches, resolved by the owning category. */
    readonly languageModels: LanguageModel[] | undefined;
    readonly languageModelAliases: LanguageModelAlias[];
    /** Bumped by the owning category on every upstream change, to re-run the async detail load. */
    readonly revision: number;
}

/**
 * The Agents item-detail page: enable/show-in-chat toggles, description, prompt
 * templates, LLM requirements, used variables/functions, capabilities and
 * notification settings. Owns its async state (parsed prompt parts + agent
 * settings), reloading whenever {@link AgentDetailViewProps.revision} changes.
 */
export const AgentDetailView: React.FC<AgentDetailViewProps> = ({ agent, services, languageModels, languageModelAliases, revision }) => {
    const { agentService, aiSettingsService, variableService, promptService, languageModelRegistry, commandService } = services;
    const [state, setState] = React.useState<AgentDetailState | undefined>(undefined);

    React.useEffect(() => {
        let disposed = false;
        loadAgentDetail(agent, services).then(loaded => {
            if (!disposed) {
                setState(loaded);
            }
        });
        return () => { disposed = true; };
    }, [agent, revision, aiSettingsService, promptService, variableService]);

    const enabled = agentService.isEnabled(agent.id);

    const toggleEnabled = React.useCallback(() => {
        if (enabled) {
            agentService.disableAgent(agent.id);
        } else {
            agentService.enableAgent(agent.id);
        }
    }, [agent, agentService, enabled]);

    const toggleShowInChat = React.useCallback(() => {
        if (!enabled || !state) {
            return;
        }
        aiSettingsService.updateAgentSettings(agent.id, { showInChat: !state.showInChat });
    }, [agent, aiSettingsService, enabled, state]);

    const handleNotificationTypeChange = React.useCallback(async (agentId: string, notificationType: NotificationType | undefined): Promise<void> => {
        await aiSettingsService.updateAgentSettings(agentId, { completionNotification: notificationType });
    }, [aiSettingsService]);

    const openNotificationSettings = React.useCallback((): void => {
        commandService.executeCommand(CommonCommands.OPEN_PREFERENCES.id, PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE);
    }, [commandService]);

    const header = <AiConfigurationItemDetailHeader
        title={agent.name}
        iconClass={getAgentIconClass(agent)}
        subtitle={nls.localizeByDefault('Id: {0}', agent.id)}
        actions={<AgentDetailToggles
            enabled={enabled}
            showInChat={state?.showInChat ?? true}
            showInChatVisible={isChatAgent(agent)}
            onToggleEnabled={toggleEnabled}
            onToggleShowInChat={toggleShowInChat}
        />}
    />;

    if (!state) {
        return <>
            {header}
            <div className='ai-agent-detail-loading'>{nls.localizeByDefault('Loading...')}</div>
        </>;
    }

    const globalVariables = Array.from(new Set([...state.parsed.globalVariables, ...agent.variables]));
    const functions = Array.from(new Set([...state.parsed.functions, ...agent.functions]));

    return <div key={agent.id} className='ai-agent-detail'>
        {header}

        {agent.description && <div className='ai-agent-description'>{agent.description}</div>}

        {agent.prompts.length > 0 && <>
            <div className='settings-section-subcategory-title ai-settings-section-subcategory-title'>
                {nls.localize('theia/ai/core/agentConfiguration/promptTemplates', 'Prompt Templates')}
            </div>
            <table className='ai-templates-table'>
                <thead>
                    <tr>
                        <th>{nls.localize('theia/ai/core/agentConfiguration/templateName', 'Template')}</th>
                        <th>{nls.localize('theia/ai/core/agentConfiguration/variant', 'Variant')}</th>
                        <th className='template-actions-header'>{nls.localizeByDefault('Actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    {agent.prompts.map(prompt => <PromptVariantRenderer
                        key={agent.id + '.' + prompt.id}
                        agentId={agent.id}
                        promptVariantSet={prompt}
                        promptService={promptService}
                    />)}
                </tbody>
            </table>
        </>}

        <div className='ai-lm-requirements'>
            <LanguageModelRenderer
                agent={agent}
                languageModels={languageModels}
                aiSettingsService={aiSettingsService}
                languageModelRegistry={languageModelRegistry}
                languageModelAliases={languageModelAliases}
            />
        </div>

        {globalVariables.length > 0 && <>
            <div className='settings-section-subcategory-title ai-settings-section-subcategory-title'>
                {nls.localize('theia/ai/core/agentConfiguration/usedGlobalVariables', 'Used Global Variables')}
            </div>
            <AgentGlobalVariables variables={globalVariables} variableService={variableService} />
        </>}

        {state.parsed.agentSpecificVariables.length > 0 && <>
            <div className='settings-section-subcategory-title ai-settings-section-subcategory-title'>
                {nls.localize('theia/ai/core/agentConfiguration/usedAgentSpecificVariables', 'Used Agent-Specific Variables')}
            </div>
            <ul className='variable-references'>
                <AgentSpecificVariables promptVariables={state.parsed.agentSpecificVariables} agent={agent} />
            </ul>
        </>}

        {functions.length > 0 && <>
            <div className='settings-section-subcategory-title ai-settings-section-subcategory-title'>
                {nls.localize('theia/ai/core/agentConfiguration/usedFunctions', 'Used Functions')}
            </div>
            <ul className='function-references'>
                <AgentFunctions functions={functions} />
            </ul>
        </>}

        {state.parsed.capabilities.length > 0 && <>
            <div className='settings-section-subcategory-title'>
                {nls.localize('theia/ai/core/agentConfiguration/availableCapabilities', 'Available Capabilities')}
            </div>
            <AgentCapabilitiesSettings
                capabilities={state.parsed.capabilities}
                agentId={agent.id}
                savedOverrides={state.capabilityOverrides}
                aiSettingsService={aiSettingsService}
            />
        </>}

        {GenericCapabilitySelections.hasSelections(state.genericCapabilitySelections) && <>
            <div className='settings-section-subcategory-title ai-settings-section-subcategory-title'>
                {nls.localize('theia/ai/ide/agentConfiguration/genericCapabilitiesSettings', 'Generic Capabilities')}
            </div>
            <AgentGenericCapabilitiesSettings
                agentId={agent.id}
                savedSelections={state.genericCapabilitySelections}
                aiSettingsService={aiSettingsService}
            />
        </>}

        {isChatAgent(agent) && <>
            <div className='settings-section-subcategory-title ai-settings-section-subcategory-title'>
                {nls.localize('theia/ai/core/agentConfiguration/notificationSettings', 'Notification Settings')}
            </div>
            <AgentNotificationSettings
                agentId={agent.id}
                currentNotificationType={state.completionNotification}
                onNotificationTypeChange={handleNotificationTypeChange}
                onOpenNotificationSettings={openNotificationSettings}
            />
        </>}
    </div>;
};

async function loadAgentDetail(agent: Agent, services: AgentDetailServices): Promise<AgentDetailState> {
    const parsed = await parsePromptFragments(agent, services);
    const agentSettings = await services.aiSettingsService.getAgentSettings(agent.id);
    return {
        parsed,
        showInChat: agentSettings?.showInChat ?? true,
        completionNotification: agentSettings?.completionNotification,
        capabilityOverrides: agentSettings?.capabilityOverrides,
        genericCapabilitySelections: agentSettings?.genericCapabilitySelections
    };
}

async function parsePromptFragments(agent: Agent, services: AgentDetailServices): Promise<ParsedPrompt> {
    const { aiSettingsService, promptService, variableService } = services;
    const result: ParsedPrompt = { functions: [], globalVariables: [], agentSpecificVariables: [], capabilities: [] };
    const agentSettings = await aiSettingsService.getAgentSettings(agent.id);
    const selectedVariants = agentSettings?.selectedVariants ?? {};

    for (const mainTemplate of agent.prompts) {
        const promptId = selectedVariants[mainTemplate.id] ?? mainTemplate.defaultVariant?.id ?? mainTemplate.id;
        const promptToAnalyze = promptService.getRawPromptFragment(promptId)?.template;
        if (!promptToAnalyze) {
            continue;
        }
        extractVariablesAndFunctions(promptToAnalyze, result, agent, variableService);
        extractCapabilities(promptToAnalyze, result, promptService);
    }
    return result;
}

function extractCapabilities(promptContent: string, result: ParsedPrompt, promptService: PromptService): void {
    const capabilities = parseCapabilitiesFromTemplate(promptContent);
    const existingIds = new Set(result.capabilities.map(c => c.fragmentId));
    for (const capability of capabilities) {
        if (!existingIds.has(capability.fragmentId)) {
            const fragment = promptService.getRawPromptFragment(capability.fragmentId);
            result.capabilities.push({ ...capability, name: fragment?.name, description: fragment?.description });
            existingIds.add(capability.fragmentId);
        }
    }
}

function extractVariablesAndFunctions(promptContent: string, result: ParsedPrompt, agent: Agent, variableService: AIVariableService): void {
    const variableMatches = matchVariablesRegEx(promptContent);
    variableMatches.forEach(match => {
        const variableId = match[1];
        if (variableId.startsWith('!--') || variableId.startsWith('capability:')) {
            return;
        }
        const baseVariableId = variableId.split(':')[0];
        if (variableService.hasVariable(baseVariableId) && agent.agentSpecificVariables.find(v => v.name === baseVariableId) === undefined) {
            result.globalVariables.push(variableId);
        } else {
            result.agentSpecificVariables.push(variableId);
        }
    });
    const functionMatches = [...promptContent.matchAll(PROMPT_FUNCTION_REGEX)];
    functionMatches.forEach(match => result.functions.push(match[1]));
}

interface AgentDetailTogglesProps {
    enabled: boolean;
    showInChat: boolean;
    showInChatVisible: boolean;
    onToggleEnabled: () => void;
    onToggleShowInChat: () => void;
}
const AgentDetailToggles = ({ enabled, showInChat, showInChatVisible, onToggleEnabled, onToggleShowInChat }: AgentDetailTogglesProps) => (
    <div className='agent-toggles'>
        <div className='agent-enable-toggle' title={nls.localize('theia/ai/core/agentConfiguration/enableAgent', 'Enable Agent')}>
            <span className='toggle-label'>{nls.localize('theia/ai/core/agentConfiguration/enableAgent', 'Enable Agent')}</span>
            <AiToggleSwitch
                checked={enabled}
                ariaLabel={nls.localize('theia/ai/core/agentConfiguration/enableAgent', 'Enable Agent')}
                onChange={onToggleEnabled}
            />
        </div>
        {showInChatVisible && <div
            className={`agent-enable-toggle${enabled ? '' : ' disabled'}`}
            title={nls.localize('theia/ai/core/agentConfiguration/showInChat', 'Show in Chat')}>
            <span className='toggle-label'>{nls.localize('theia/ai/core/agentConfiguration/showInChat', 'Show in Chat')}</span>
            <AiToggleSwitch
                checked={showInChat}
                disabled={!enabled}
                ariaLabel={nls.localize('theia/ai/core/agentConfiguration/showInChat', 'Show in Chat')}
                onChange={onToggleShowInChat}
            />
        </div>}
    </div>
);

interface AgentGlobalVariablesProps {
    variables: string[];
    variableService: AIVariableService;
}
const AgentGlobalVariables = ({ variables: globalVariables, variableService }: AgentGlobalVariablesProps) => {
    if (globalVariables.length === 0) {
        return <div className='ai-empty-state-content'>{nls.localizeByDefault('None')}</div>;
    }
    const allVariables = variableService.getVariables();
    const variableData = globalVariables.map(varId => {
        const variable = allVariables.find(v => v.id === varId);
        return { id: varId, name: variable?.name || varId, description: variable?.description || '' };
    });
    return <table className='ai-templates-table'>
        <thead>
            <tr>
                <th>{nls.localizeByDefault('Variable')}</th>
                <th>{nls.localizeByDefault('Description')}</th>
            </tr>
        </thead>
        <tbody>
            {variableData.map(variable => <tr key={variable.id}>
                <td className='ai-variable-name-cell'>{variable.name}</td>
                <td className='ai-variable-description-cell'>
                    {variable.description || nls.localize('theia/ai/ide/agentConfiguration/noDescription', 'No description available')}
                </td>
            </tr>)}
        </tbody>
    </table>;
};

const AgentFunctions = ({ functions }: { functions: string[] }) => {
    if (functions.length === 0) {
        return <>{nls.localizeByDefault('None')}</>;
    }
    return <>
        {functions.map(functionId => <li key={functionId} className='variable-reference'><span>{functionId}</span></li>)}
    </>;
};

interface AgentCapabilitiesSettingsProps {
    capabilities: ParsedCapability[];
    agentId: string;
    savedOverrides: Record<string, boolean> | undefined;
    aiSettingsService: AISettingsService;
}
const AgentCapabilitiesSettings = ({ capabilities, agentId, savedOverrides, aiSettingsService }: AgentCapabilitiesSettingsProps) => {
    const [loading, setLoading] = React.useState(false);

    const handleToggle = async (fragmentId: string, currentValue: boolean): Promise<void> => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            const capability = capabilities.find(c => c.fragmentId === fragmentId);
            if (!capability) {
                return;
            }
            const newValue = !currentValue;
            const newOverrides = { ...savedOverrides };
            if (newValue === capability.defaultEnabled) {
                delete newOverrides[fragmentId];
            } else {
                newOverrides[fragmentId] = newValue;
            }
            await aiSettingsService.updateAgentSettings(agentId, { capabilityOverrides: newOverrides });
        } finally {
            setLoading(false);
        }
    };

    const handleResetAll = async (): Promise<void> => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            await aiSettingsService.updateAgentSettings(agentId, { capabilityOverrides: undefined });
        } finally {
            setLoading(false);
        }
    };

    const getCurrentValue = (capability: ParsedCapability): boolean =>
        savedOverrides && capability.fragmentId in savedOverrides ? savedOverrides[capability.fragmentId] : capability.defaultEnabled;
    const hasOverride = (capability: ParsedCapability): boolean => savedOverrides !== undefined && capability.fragmentId in savedOverrides;
    const hasAnyOverrides = savedOverrides && Object.keys(savedOverrides).length > 0;

    return <>
        {hasAnyOverrides && <div className='capability-reset-all-container'>
            <button
                className='theia-button secondary'
                onClick={handleResetAll}
                disabled={loading}
                title={nls.localize('theia/ai/ide/agentConfiguration/resetAllCapabilities', 'Reset all capabilities to their default values')}>
                {nls.localize('theia/ai/ide/agentConfiguration/resetAllDefaults', 'Reset All to Defaults')}
            </button>
        </div>}
        <table className='ai-templates-table'>
            <thead>
                <tr>
                    <th>{nls.localizeByDefault('ID')}</th>
                    <th>{nls.localizeByDefault('Name')}</th>
                    <th>{nls.localizeByDefault('Description')}</th>
                    <th>{nls.localizeByDefault('Enabled')}</th>
                </tr>
            </thead>
            <tbody>
                {capabilities.map(capability => <tr key={capability.fragmentId} className={hasOverride(capability) ? 'capability-modified' : ''}>
                    <td className='ai-variable-name-cell'>{capability.fragmentId}</td>
                    <td className='ai-variable-name-cell'>{capability.name ?? capability.fragmentId}</td>
                    <td className='ai-variable-description-cell'>
                        {capability.description ?? nls.localize('theia/ai/ide/agentConfiguration/noDescription', 'No description available')}
                    </td>
                    <td>
                        <AiToggleSwitch
                            checked={getCurrentValue(capability)}
                            disabled={loading}
                            ariaLabel={capability.name ?? capability.fragmentId}
                            onChange={() => handleToggle(capability.fragmentId, getCurrentValue(capability))}
                        />
                    </td>
                </tr>)}
            </tbody>
        </table>
    </>;
};

interface AgentSpecificVariablesProps {
    promptVariables: string[];
    agent: Agent;
}
const AgentSpecificVariables = ({ promptVariables, agent }: AgentSpecificVariablesProps) => {
    const agentDefinedVariablesName = agent.agentSpecificVariables.map(v => v.name);
    const variables = Array.from(new Set([...promptVariables, ...agentDefinedVariablesName]));
    if (variables.length === 0) {
        return <div className='ai-empty-state-content'>{nls.localizeByDefault('None')}</div>;
    }
    return <div>
        {variables.map(variableId => <AgentSpecificVariable key={variableId} variableId={variableId} agent={agent} promptVariables={promptVariables} />)}
    </div>;
};

interface AgentSpecificVariableProps {
    variableId: string;
    agent: Agent;
    promptVariables: string[];
}
const AgentSpecificVariable = ({ variableId, agent, promptVariables }: AgentSpecificVariableProps) => {
    const agentDefinedVariable = agent.agentSpecificVariables.find(v => v.name === variableId);
    const undeclared = agentDefinedVariable === undefined;
    const notUsed = !promptVariables.includes(variableId) && agentDefinedVariable?.usedInPrompt === true;
    return <div key={variableId} className='ai-agent-specific-variable-item'>
        <div className='ai-configuration-value-row'>
            <span className='ai-configuration-value-row-label'>{nls.localizeByDefault('Name')}:</span>
            <span className='ai-configuration-value-row-value'>{variableId}</span>
        </div>
        {undeclared ? <div
            className='ai-configuration-value-row'
            title={nls.localize('theia/ai/core/agentConfiguration/undeclaredTooltip',
                'This variable is used in the prompt but has no description declared by the agent.')}>
            <span className='ai-configuration-value-row-label'>{nls.localizeByDefault('Status')}:</span>
            <span className='ai-configuration-value-row-value ai-configuration-warning-text'>
                {nls.localize('theia/ai/core/agentConfiguration/undeclared', 'Undeclared')}
            </span>
        </div> : <>
            <div className='ai-configuration-value-row'>
                <span className='ai-configuration-value-row-label'>{nls.localizeByDefault('Description')}:</span>
                <span className='ai-configuration-value-row-value'>{agentDefinedVariable.description}</span>
            </div>
            {notUsed && <div
                className='ai-configuration-value-row'
                title={nls.localize('theia/ai/core/agentConfiguration/notUsedInPromptTooltip',
                    'This variable is declared by the agent but not referenced in the current prompt template.')}>
                <span className='ai-configuration-value-row-label'>{nls.localizeByDefault('Status')}:</span>
                <span className='ai-configuration-value-row-value ai-configuration-warning-text'>
                    {nls.localize('theia/ai/core/agentConfiguration/notUsedInPrompt', 'Not used in prompt')}
                </span>
            </div>}
        </>}
    </div>;
};

interface AgentGenericCapabilitiesSettingsProps {
    agentId: string;
    savedSelections: GenericCapabilitySelections | undefined;
    aiSettingsService: AISettingsService;
}
const AgentGenericCapabilitiesSettings = ({ agentId, savedSelections, aiSettingsService }: AgentGenericCapabilitiesSettingsProps) => {
    const [loading, setLoading] = React.useState(false);

    const handleReset = async (capabilityType: keyof GenericCapabilitySelections): Promise<void> => {
        if (loading) {
            return;
        }
        setLoading(true);
        try {
            const newSelections: GenericCapabilitySelections = { ...savedSelections, [capabilityType]: undefined };
            await aiSettingsService.updateAgentSettings(agentId, { genericCapabilitySelections: newSelections });
        } finally {
            setLoading(false);
        }
    };

    const capabilityTypes = CAPABILITY_TYPE_PROMPT_MAP.map(m => m.type);
    const getDisplayName = (type: keyof GenericCapabilitySelections): string => ({
        skills: nls.localizeByDefault('Skills'),
        mcpFunctions: nls.localize('theia/ai/ide/agentConfiguration/genericCapabilityType/mcpFunctions', 'MCP Functions'),
        functions: nls.localize('theia/ai/ide/agentConfiguration/genericCapabilityType/functions', 'Functions'),
        promptFragments: nls.localize('theia/ai/ide/agentConfiguration/genericCapabilityType/promptFragments', 'Prompt Fragments'),
        agentDelegation: nls.localize('theia/ai/ide/agentConfiguration/genericCapabilityType/agentDelegation', 'Agent Delegation'),
        variables: nls.localizeByDefault('Variables')
    } as const)[type];

    return <table className='ai-templates-table'>
        <thead>
            <tr>
                <th>{nls.localizeByDefault('Type')}</th>
                <th>{nls.localize('theia/ai/ide/agentConfiguration/selections', 'Selections')}</th>
                <th className='template-actions-header'>{nls.localizeByDefault('Actions')}</th>
            </tr>
        </thead>
        <tbody>
            {capabilityTypes
                .filter(type => (savedSelections?.[type]?.length ?? 0) > 0)
                .map(type => <tr key={type}>
                    <td className='ai-variable-name-cell'>{getDisplayName(type)}</td>
                    <td className='ai-variable-description-cell'>{(savedSelections?.[type] ?? []).join(', ')}</td>
                    <td className='template-actions-cell'>
                        <button className='theia-button secondary' onClick={() => handleReset(type)} disabled={loading} title={nls.localizeByDefault('Reset')}>
                            {nls.localizeByDefault('Reset')}
                        </button>
                    </td>
                </tr>)}
        </tbody>
    </table>;
};
