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

import { Agent, AgentService } from '@theia/ai-core';
import { CustomizationSource } from '@theia/ai-core/lib/browser/frontend-prompt-customization-service';
import { SkillService } from '@theia/ai-core/lib/browser/skill-service';
import { Skill } from '@theia/ai-core/lib/common/skill';
import {
    BasePromptFragment,
    CustomizedPromptFragment,
    isBasePromptFragment,
    isCustomizedPromptFragment,
    PromptFragment,
    PromptService
} from '@theia/ai-core/lib/common/prompt-service';
import { isChatAgent } from '@theia/ai-chat';
import { Emitter, Event, nls, URI } from '@theia/core';
import { codicon, ConfirmDialog, open, OpenerService } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';

/**
 * The Prompts & Skills category: a `single-page` category that renders the existing Prompt
 * Fragments surface (prompt variant sets and other fragments with their customizations) together
 * with the Skills and Slash Commands tables. This reserves the merged category; the deeper
 * consolidation and cross-links are handled by a follow-up ticket.
 */
@injectable()
export class PromptsAndSkillsConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.PROMPTS_AND_SKILLS;
    readonly label = nls.localize('theia/ai/ide/promptsAndSkillsConfiguration/label', 'Prompts & Skills');
    readonly iconClass = codicon('note');
    readonly order = AiConfigurationCategoryOrder.PROMPTS_AND_SKILLS;
    readonly kind = 'single-page' as const;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(SkillService)
    protected readonly skillService: SkillService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected promptFragmentMap = new Map<string, PromptFragment[]>();
    protected promptVariantsMap = new Map<string, string[]>();
    protected activePromptFragments: PromptFragment[] = [];
    protected expandedPromptFragmentIds = new Set<string>();
    protected expandedPromptFragmentTemplates = new Set<string>();
    protected expandedPromptVariantSetIds = new Set<string>();
    protected availableAgents: Agent[] = [];
    protected effectiveVariantIds = new Map<string, string | undefined>();
    protected defaultVariantIds = new Map<string, string | undefined>();
    protected userSelectedVariantIds = new Map<string, string | undefined>();
    protected skills: Skill[] = [];
    protected slashCommands: PromptFragment[] = [];

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.loadPromptFragments();
        this.loadAgents();
        this.loadSkills();
        this.loadSlashCommands();
        this.toDispose.pushAll([
            this.promptService.onPromptsChange(() => {
                this.loadPromptFragments();
                this.loadSlashCommands();
                this.onDidChangeEmitter.fire();
            }),
            this.agentService.onDidChangeAgents(() => {
                this.loadAgents();
                this.onDidChangeEmitter.fire();
            }),
            this.skillService.onSkillsChanged(() => {
                this.loadSkills();
                this.onDidChangeEmitter.fire();
            })
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected loadPromptFragments(): void {
        this.promptFragmentMap = this.promptService.getAllPromptFragments();
        this.promptVariantsMap = this.promptService.getPromptVariantSets();
        this.activePromptFragments = this.promptService.getActivePromptFragments();

        this.expandedPromptFragmentIds = new Set(Array.from(this.expandedPromptFragmentIds).filter(id => this.promptFragmentMap.has(id)));
        this.expandedPromptVariantSetIds = new Set(Array.from(this.expandedPromptVariantSetIds).filter(id => this.promptVariantsMap.has(id)));
        this.expandedPromptFragmentTemplates = new Set(Array.from(this.expandedPromptFragmentTemplates).filter(id => this.promptFragmentMap.has(id.split('_')[0])));

        for (const promptVariantSetId of this.promptVariantsMap.keys()) {
            const effectiveId = this.promptService.getEffectiveVariantId(promptVariantSetId);
            const defaultId = this.promptService.getDefaultVariantId(promptVariantSetId);
            const selectedId = this.promptService.getSelectedVariantId(promptVariantSetId) ?? defaultId;
            this.userSelectedVariantIds.set(promptVariantSetId, selectedId);
            this.effectiveVariantIds.set(promptVariantSetId, effectiveId);
            this.defaultVariantIds.set(promptVariantSetId, defaultId);
        }
    }

    protected loadAgents(): void {
        this.availableAgents = this.agentService.getAllAgents();
    }

    protected loadSkills(): void {
        this.skills = this.skillService.getSkills().sort((a, b) => a.name.localeCompare(b.name));
    }

    protected loadSlashCommands(): void {
        this.slashCommands = this.promptService.getCommands().sort((a, b) => (a.commandName ?? a.id).localeCompare(b.commandName ?? b.id));
    }

    protected getAgentsUsingPromptVariantId(promptVariantSetId: string): Agent[] {
        return this.availableAgents.filter(agent => agent.prompts.find(promptVariantSet => promptVariantSet.id === promptVariantSetId));
    }

    protected getAgentsForCommand(command: PromptFragment): Agent[] {
        if (!command.commandAgents || command.commandAgents.length === 0) {
            return [];
        }
        return this.availableAgents.filter(agent => command.commandAgents!.includes(agent.id));
    }

    protected togglePromptVariantSetExpansion = (promptVariantSetId: string): void => {
        this.toggle(this.expandedPromptVariantSetIds, promptVariantSetId);
    };

    protected togglePromptFragmentExpansion = (promptFragmentId: string): void => {
        this.toggle(this.expandedPromptFragmentIds, promptFragmentId);
    };

    protected toggleTemplateExpansion = (fragmentKey: string, event: React.MouseEvent): void => {
        event.stopPropagation();
        this.toggle(this.expandedPromptFragmentTemplates, fragmentKey);
    };

    protected toggle(set: Set<string>, id: string): void {
        if (set.has(id)) {
            set.delete(id);
        } else {
            set.add(id);
        }
        this.onDidChangeEmitter.fire();
    }

    protected editPromptCustomization = (promptFragment: CustomizedPromptFragment, event: React.MouseEvent): void => {
        event.stopPropagation();
        this.promptService.editCustomization(promptFragment.id, promptFragment.customizationId);
    };

    protected isActiveCustomization(promptFragment: PromptFragment): boolean {
        const activePromptFragment = this.activePromptFragments.find(activePrompt => activePrompt.id === promptFragment.id);
        if (!activePromptFragment) {
            return false;
        }
        if (isCustomizedPromptFragment(activePromptFragment) && isCustomizedPromptFragment(promptFragment)) {
            return activePromptFragment.id === promptFragment.id
                && activePromptFragment.template === promptFragment.template
                && activePromptFragment.customizationId === promptFragment.customizationId
                && activePromptFragment.priority === promptFragment.priority;
        }
        if (isBasePromptFragment(activePromptFragment) && isBasePromptFragment(promptFragment)) {
            return activePromptFragment.id === promptFragment.id && activePromptFragment.template === promptFragment.template;
        }
        return false;
    }

    protected resetToPromptFragment = async (customization: PromptFragment, event: React.MouseEvent): Promise<void> => {
        event.stopPropagation();
        if (isCustomizedPromptFragment(customization)) {
            const type = await this.promptService.getCustomizationType(customization.id, customization.customizationId);
            const dialog = new ConfirmDialog({
                title: nls.localize('theia/ai/core/promptFragmentsConfiguration/resetToCustomizationDialogTitle', 'Reset to Customization'),
                msg: nls.localize('theia/ai/core/promptFragmentsConfiguration/resetToCustomizationDialogMsg',
                    'Are you sure you want to reset the prompt fragment "{0}" to use the {1} customization? This will remove all higher-priority customizations.',
                    customization.id, type),
                ok: nls.localizeByDefault('Reset'),
                cancel: nls.localizeByDefault('Cancel')
            });
            if (await dialog.open()) {
                await this.promptService.resetToCustomization(customization.id, customization.customizationId);
            }
        } else {
            const dialog = new ConfirmDialog({
                title: nls.localize('theia/ai/core/promptFragmentsConfiguration/resetToBuiltInDialogTitle', 'Reset to Built-in'),
                msg: nls.localize('theia/ai/core/promptFragmentsConfiguration/resetToBuiltInDialogMsg',
                    'Are you sure you want to reset the prompt fragment "{0}" to its built-in version? This will remove all customizations.', customization.id),
                ok: nls.localizeByDefault('Reset'),
                cancel: nls.localizeByDefault('Cancel')
            });
            if (await dialog.open()) {
                await this.promptService.resetToBuiltIn(customization.id);
            }
        }
    };

    protected createPromptFragmentCustomization = (promptFragment: BasePromptFragment, event: React.MouseEvent): void => {
        event.stopPropagation();
        this.promptService.createBuiltInCustomization(promptFragment.id);
    };

    protected deletePromptFragmentCustomization = async (customization: CustomizedPromptFragment, event: React.MouseEvent): Promise<void> => {
        event.stopPropagation();
        const type = await this.promptService.getCustomizationType(customization.id, customization.customizationId) || '';
        const description = await this.promptService.getCustomizationDescription(customization.id, customization.customizationId) || '';
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/core/promptFragmentsConfiguration/removeCustomizationDialogTitle', 'Remove Customization'),
            msg: description
                ? nls.localize('theia/ai/core/promptFragmentsConfiguration/removeCustomizationWithDescDialogMsg',
                    'Are you sure you want to remove the {0} customization for prompt fragment "{1}" ({2})?', type, customization.id, description)
                : nls.localize('theia/ai/core/promptFragmentsConfiguration/removeCustomizationDialogMsg',
                    'Are you sure you want to remove the {0} customization for prompt fragment "{1}"?', type, customization.id),
            ok: nls.localizeByDefault('Remove'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            await this.promptService.removeCustomization(customization.id, customization.customizationId);
        }
    };

    protected removeAllCustomizations = async (): Promise<void> => {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/core/promptFragmentsConfiguration/resetAllCustomizationsDialogTitle', 'Reset All Customizations'),
            msg: nls.localize('theia/ai/core/promptFragmentsConfiguration/resetAllCustomizationsDialogMsg',
                'Are you sure you want to reset all prompt fragments to their built-in versions? This will remove all customizations.'),
            ok: nls.localize('theia/ai/core/promptFragmentsConfiguration/resetAllButton', 'Reset All'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            this.promptService.resetAllToBuiltIn();
        }
    };

    protected openSkill = (skill: Skill): void => {
        open(this.openerService, URI.fromFilePath(skill.location));
    };

    protected override renderHeader(): React.ReactNode {
        return <div className='prompt-fragments-header'>
            <h2>{nls.localize('theia/ai/core/promptFragmentsConfiguration/headerTitle', 'Prompt Fragments')}</h2>
            <div className='global-actions'>
                <button
                    className='global-action-button'
                    onClick={this.removeAllCustomizations}
                    title={nls.localize('theia/ai/core/promptFragmentsConfiguration/resetAllCustomizationsTitle', 'Reset all customizations')}
                >
                    {nls.localize('theia/ai/core/promptFragmentsConfiguration/resetAllPromptFragments', 'Reset all prompt fragments')}
                    <span className={codicon('clear-all')}></span>
                </button>
            </div>
        </div>;
    }

    protected renderSections(): React.ReactNode {
        const nonSystemPromptFragments = this.getNonPromptVariantSetFragments();
        return <div className='ai-prompt-fragments-configuration'>
            <div className='prompt-variants-container'>
                <h3 className='section-header'>{nls.localize('theia/ai/core/promptFragmentsConfiguration/promptVariantsHeader', 'Prompt Variant Sets')}</h3>
                {Array.from(this.promptVariantsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([promptVariantSetId, variantIds]) => this.renderPromptVariantSet(promptVariantSetId, variantIds))}
            </div>
            {nonSystemPromptFragments.size > 0 && <div className='prompt-fragments-container'>
                <h3 className='section-header'>{nls.localize('theia/ai/core/promptFragmentsConfiguration/otherPromptFragmentsHeader', 'Other Prompt Fragments')}</h3>
                {Array.from(nonSystemPromptFragments.entries()).sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([promptFragmentId, fragments]) => this.renderPromptFragment(promptFragmentId, fragments))}
            </div>}
            {this.promptFragmentMap.size === 0 && <div className='no-fragments'>
                <p>{nls.localize('theia/ai/core/promptFragmentsConfiguration/noFragmentsAvailable', 'No prompt fragments available.')}</p>
            </div>}
            {this.renderSkillsSection()}
            {this.renderSlashCommandsSection()}
        </div>;
    }

    protected renderPromptVariantSet(promptVariantSetId: string, variantIds: string[]): React.ReactNode {
        const isSectionExpanded = this.expandedPromptVariantSetIds.has(promptVariantSetId);
        const selectedVariantId = this.userSelectedVariantIds.get(promptVariantSetId);
        const effectiveVariantId = this.effectiveVariantIds.get(promptVariantSetId);
        const defaultVariantId = this.defaultVariantIds.get(promptVariantSetId);
        const variantGroups = new Map<string, PromptFragment[]>();
        for (const variantId of variantIds) {
            if (this.promptFragmentMap.has(variantId)) {
                variantGroups.set(variantId, this.promptFragmentMap.get(variantId)!);
            }
        }
        const relatedAgents = this.getAgentsUsingPromptVariantId(promptVariantSetId);
        let variantSetMessage: React.ReactNode | undefined;
        if (effectiveVariantId === undefined) {
            variantSetMessage = <div className='prompt-variant-error'>
                <span className={codicon('error')}></span>
                {nls.localize('theia/ai/core/promptFragmentsConfiguration/variantSetError',
                    'The selected variant does not exist and no default could be found. Please check your configuration.')}
            </div>;
        } else {
            const needsWarning = selectedVariantId ? effectiveVariantId !== selectedVariantId : effectiveVariantId !== defaultVariantId;
            if (needsWarning) {
                variantSetMessage = <div className='prompt-variant-warning'>
                    <span className={codicon('warning')}></span>
                    {nls.localize('theia/ai/core/promptFragmentsConfiguration/variantSetWarning',
                        'The selected variant does not exist. The default variant is being used instead.')}
                </div>;
            }
        }
        return <div className='prompt-fragment-section' key={`variant-${promptVariantSetId}`}>
            <div className={`prompt-fragment-header ${isSectionExpanded ? 'expanded' : ''}`} onClick={() => this.togglePromptVariantSetExpansion(promptVariantSetId)}>
                <div className='prompt-fragment-title'>
                    <span className='expansion-icon'>{isSectionExpanded ? '▼' : '▶'}</span>
                    <h2>{promptVariantSetId}</h2>
                </div>
                {relatedAgents.length > 0 && <div className='agent-chips-container'>
                    {relatedAgents.map(agent => <span
                        key={agent.id}
                        className='agent-chip'
                        title={nls.localize('theia/ai/core/promptFragmentsConfiguration/usedByAgentTitle', 'Used by agent: {0}', agent.name)}
                        onClick={event => event.stopPropagation()}
                    >
                        <span className={(isChatAgent(agent) && agent.iconClass) ? agent.iconClass : codicon('copilot')}></span>
                        {agent.name}
                    </span>)}
                </div>}
            </div>
            {isSectionExpanded && <div className='prompt-fragment-body'>
                {variantSetMessage}
                <div className='prompt-fragment-description'>
                    <p>{nls.localize('theia/ai/core/promptFragmentsConfiguration/variantsOfSystemPrompt', 'Variants of this prompt variant set:')}</p>
                </div>
                {Array.from(variantGroups.entries()).map(([variantId, fragments]) => {
                    const isVariantExpanded = this.expandedPromptFragmentIds.has(variantId);
                    return <div key={variantId} className={`prompt-fragment-section ${selectedVariantId === variantId ? 'selected-variant' : ''}`}>
                        <div className={`prompt-fragment-header ${isVariantExpanded ? 'expanded' : ''}`} onClick={() => this.togglePromptFragmentExpansion(variantId)}>
                            <div className='prompt-fragment-title'>
                                <span className='expansion-icon'>{isVariantExpanded ? '▼' : '▶'}</span>
                                <h4>{variantId}</h4>
                                {defaultVariantId === variantId && <span
                                    className='badge default-variant'
                                    title={nls.localize('theia/ai/core/promptFragmentsConfiguration/defaultVariantTitle', 'Default variant')}
                                >{nls.localizeByDefault('Default')}</span>}
                                {selectedVariantId === variantId && <span
                                    className='selected-indicator'
                                    title={nls.localize('theia/ai/core/promptFragmentsConfiguration/selectedVariantTitle', 'Selected variant')}
                                >{nls.localize('theia/ai/core/promptFragmentsConfiguration/selectedVariantLabel', 'Selected')}</span>}
                            </div>
                        </div>
                        {isVariantExpanded && <div className='prompt-fragment-body'>
                            {fragments.map(fragment => this.renderPromptFragmentCustomization(fragment))}
                        </div>}
                    </div>;
                })}
            </div>}
        </div>;
    }

    protected getNonPromptVariantSetFragments(): Map<string, PromptFragment[]> {
        const nonSystemPromptFragments = new Map<string, PromptFragment[]>();
        const allVariantIds = new Set<string>();
        this.promptVariantsMap.forEach(variants => variants.forEach(variantId => allVariantIds.add(variantId)));
        this.promptVariantsMap.forEach((_, promptVariantSetId) => allVariantIds.add(promptVariantSetId));
        this.promptFragmentMap.forEach((fragments, promptFragmentId) => {
            if (!allVariantIds.has(promptFragmentId)) {
                nonSystemPromptFragments.set(promptFragmentId, fragments);
            }
        });
        return nonSystemPromptFragments;
    }

    protected renderPromptFragment(promptFragmentId: string, customizations: PromptFragment[]): React.ReactNode {
        const isSectionExpanded = this.expandedPromptFragmentIds.has(promptFragmentId);
        return <div className='prompt-fragment-group' key={promptFragmentId}>
            <div className={`prompt-fragment-header ${isSectionExpanded ? 'expanded' : ''}`} onClick={() => this.togglePromptFragmentExpansion(promptFragmentId)}>
                <div className='prompt-fragment-title'>
                    <span className='expansion-icon'>{isSectionExpanded ? '▼' : '▶'}</span>
                    {promptFragmentId}
                </div>
            </div>
            {isSectionExpanded && <div className='prompt-fragment-body'>
                {customizations.map(fragment => this.renderPromptFragmentCustomization(fragment))}
            </div>}
        </div>;
    }

    protected renderPromptFragmentCustomization(promptFragment: PromptFragment): React.ReactNode {
        const isCustomized = isCustomizedPromptFragment(promptFragment);
        const isActive = this.isActiveCustomization(promptFragment);
        const fragmentKey = `${promptFragment.id}_${isCustomized ? promptFragment.customizationId : 'built-in'}`;
        const isTemplateExpanded = this.expandedPromptFragmentTemplates.has(fragmentKey);
        const hasCustomizedBuiltIn = this.promptFragmentMap.get(promptFragment.id)
            ?.some(fragment => isCustomizedPromptFragment(fragment) && fragment.priority === CustomizationSource.CUSTOMIZED);
        return <div className={`prompt-customization ${isActive ? 'active-customization' : ''}`} key={fragmentKey}>
            <div className='prompt-customization-header'>
                <div className='prompt-customization-title'>
                    <React.Suspense fallback={<div>{nls.localizeByDefault('Loading...')}</div>}>
                        <CustomizationTypeBadge promptFragment={promptFragment} promptService={this.promptService} />
                    </React.Suspense>
                    {isActive && <span
                        className='active-indicator'
                        title={nls.localize('theia/ai/core/promptFragmentsConfiguration/activeCustomizationTitle', 'Active customization')}
                    >{nls.localizeByDefault('Active')}</span>}
                </div>
                <div className='prompt-customization-actions'>
                    {!isCustomized && !hasCustomizedBuiltIn && <button
                        className='template-action-button config-button'
                        onClick={event => this.createPromptFragmentCustomization(promptFragment, event)}
                        title={nls.localize('theia/ai/core/promptFragmentsConfiguration/createCustomizationTitle', 'Create Customization')}
                    ><span className={codicon('add')}></span></button>}
                    {isCustomized && <button
                        className='source-uri-button'
                        onClick={event => this.editPromptCustomization(promptFragment, event)}
                        title={nls.localize('theia/ai/core/promptFragmentsConfiguration/editTemplateTitle', 'Edit template')}
                    ><span className={codicon('edit')}></span></button>}
                    {!isActive && <button
                        className='template-action-button reset-button'
                        onClick={event => this.resetToPromptFragment(promptFragment, event)}
                        title={!isCustomized
                            ? nls.localize('theia/ai/core/promptFragmentsConfiguration/resetToBuiltInTitle', 'Reset to this built-in')
                            : nls.localize('theia/ai/core/promptFragmentsConfiguration/resetToCustomizationTitle', 'Reset to this customization')}
                    ><span className={codicon('discard')}></span></button>}
                    {isCustomized && <button
                        className='template-action-button delete-button'
                        onClick={event => this.deletePromptFragmentCustomization(promptFragment, event)}
                        title={nls.localize('theia/ai/core/promptFragmentsConfiguration/deleteCustomizationTitle', 'Delete Customization')}
                    ><span className={codicon('trash')}></span></button>}
                </div>
            </div>
            {isCustomized && <React.Suspense fallback={<div>{nls.localizeByDefault('Loading...')}</div>}>
                <DescriptionBadge promptFragment={promptFragment} promptService={this.promptService} />
            </React.Suspense>}
            <div className='template-content-container'>
                <div className='template-toggle-button' onClick={event => this.toggleTemplateExpansion(fragmentKey, event)}>
                    <span className='template-expansion-icon'>{isTemplateExpanded ? '▼' : '▶'}</span>
                    <span>{nls.localize('theia/ai/core/promptFragmentsConfiguration/promptTemplateText', 'Prompt Template Text')}</span>
                </div>
                {isTemplateExpanded && <div className='template-content'><pre>{promptFragment.template}</pre></div>}
            </div>
        </div>;
    }

    protected renderSkillsSection(): React.ReactNode {
        return <div className='ai-skills-section'>
            <h3 className='section-header'>{nls.localizeByDefault('Skills')}</h3>
            {this.skills.length === 0
                ? <div className='ai-empty-state-content'>{nls.localize('theia/ai/ide/skillsConfiguration/noSkills', 'No skills available')}</div>
                : <div className='ai-configuration-table-container'>
                    <table className='ai-configuration-table'>
                        <thead>
                            <tr>
                                <th className='skill-name-column'>{nls.localizeByDefault('Name')}</th>
                                <th className='skill-description-column'>{nls.localizeByDefault('Description')}</th>
                                <th className='skill-location-column'>{nls.localizeByDefault('Location')}</th>
                                <th className='skill-open-column'></th>
                            </tr>
                        </thead>
                        <tbody>
                            {this.skills.map(skill => <tr key={skill.name}>
                                <td className='skill-name-column'><span>{skill.name}</span></td>
                                <td className='skill-description-column'><span>{skill.description}</span></td>
                                <td className='skill-location-column'><span>{skill.location}</span></td>
                                <td className='skill-open-column'>
                                    <button className='theia-button secondary' onClick={() => this.openSkill(skill)} title={nls.localizeByDefault('Open')}>
                                        {nls.localizeByDefault('Open')}
                                    </button>
                                </td>
                            </tr>)}
                        </tbody>
                    </table>
                </div>}
        </div>;
    }

    protected renderSlashCommandsSection(): React.ReactNode {
        return <div className='ai-slash-commands-section'>
            <h3 className='section-header'>{nls.localize('theia/ai/ide/skillsConfiguration/slashCommandsSectionHeader', 'Slash Commands')}</h3>
            {this.slashCommands.length === 0
                ? <div className='ai-empty-state-content'>{nls.localize('theia/ai/ide/skillsConfiguration/noSlashCommands', 'No slash commands available')}</div>
                : <div className='ai-configuration-table-container'>
                    <table className='ai-configuration-table'>
                        <thead>
                            <tr>
                                <th className='slash-command-name-column'>{nls.localizeByDefault('Command')}</th>
                                <th className='slash-command-description-column'>{nls.localizeByDefault('Description')}</th>
                                <th className='slash-command-agents-column'>{nls.localizeByDefault('Agents')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {this.slashCommands.map(command => this.renderSlashCommandRow(command))}
                        </tbody>
                    </table>
                </div>}
        </div>;
    }

    protected renderSlashCommandRow(command: PromptFragment): React.ReactNode {
        const agents = this.getAgentsForCommand(command);
        const isGlobalCommand = !command.commandAgents || command.commandAgents.length === 0;
        return <tr key={command.id}>
            <td className='slash-command-name-column'>
                <span className='slash-command-prefix'>/</span>
                <span>{command.commandName ?? command.id}</span>
            </td>
            <td className='slash-command-description-column'><span>{command.commandDescription ?? ''}</span></td>
            <td className='slash-command-agents-column'>
                {isGlobalCommand
                    ? <span className='slash-command-all-agents'>{nls.localize('theia/ai/ide/skillsConfiguration/slashCommand/allAgents', 'All agents')}</span>
                    : <div className='slash-command-agent-chips'>
                        {agents.map(agent => <span key={agent.id} className='agent-chip' title={agent.description}>
                            <span className={(isChatAgent(agent) && agent.iconClass) ? agent.iconClass : codicon('copilot')}></span>
                            {agent.name}
                        </span>)}
                    </div>}
            </td>
        </tr>;
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const items: AiConfigurationSearchItem[] = [];
        const variantSetLabel = nls.localize('theia/ai/ide/promptsAndSkillsConfiguration/variantSetTypeLabel', 'Prompt Variant Set');
        const fragmentLabel = nls.localize('theia/ai/core/promptFragmentsConfiguration/label', 'Prompt Fragments');
        const skillLabel = nls.localizeByDefault('Skill');
        const slashCommandLabel = nls.localize('theia/ai/ide/skillsConfiguration/slashCommandsSectionHeader', 'Slash Commands');
        for (const promptVariantSetId of this.promptVariantsMap.keys()) {
            items.push({ label: promptVariantSetId, typeLabel: variantSetLabel, categoryId: this.id, target: { categoryId: this.id }, keywords: promptVariantSetId });
        }
        for (const fragmentId of this.getNonPromptVariantSetFragments().keys()) {
            items.push({ label: fragmentId, typeLabel: fragmentLabel, categoryId: this.id, target: { categoryId: this.id }, keywords: fragmentId });
        }
        for (const skill of this.skills) {
            items.push({ label: skill.name, typeLabel: skillLabel, categoryId: this.id, target: { categoryId: this.id }, keywords: skill.description ?? '' });
        }
        for (const command of this.slashCommands) {
            const name = command.commandName ?? command.id;
            items.push({
                label: name,
                typeLabel: slashCommandLabel,
                categoryId: this.id,
                target: { categoryId: this.id },
                keywords: `${command.id} ${command.commandDescription ?? ''}`
            });
        }
        return items;
    }
}

/** Displays a badge indicating the type of a prompt fragment customization (built-in, user, workspace). */
const CustomizationTypeBadge: React.FC<{ promptFragment: PromptFragment; promptService: PromptService }> = ({ promptFragment, promptService }) => {
    const [typeLabel, setTypeLabel] = React.useState<string>('unknown');
    React.useEffect(() => {
        const fetchCustomizationType = async () => {
            if (isCustomizedPromptFragment(promptFragment)) {
                const customizationType = await promptService.getCustomizationType(promptFragment.id, promptFragment.customizationId);
                setTypeLabel(customizationType
                    ? customizationType + ' ' + nls.localize('theia/ai/core/promptFragmentsConfiguration/customization', 'customization')
                    : nls.localize('theia/ai/core/promptFragmentsConfiguration/customizationLabel', 'Customization'));
            } else {
                setTypeLabel(nls.localizeByDefault('Built-in'));
            }
        };
        fetchCustomizationType();
    }, [promptFragment, promptService]);
    return <span>{typeLabel}</span>;
};

/** Displays the description of a customized prompt fragment if available. */
const DescriptionBadge: React.FC<{ promptFragment: CustomizedPromptFragment; promptService: PromptService }> = ({ promptFragment, promptService }) => {
    const [description, setDescription] = React.useState<string>('');
    React.useEffect(() => {
        const fetchDescription = async () => {
            const customizationDescription = await promptService.getCustomizationDescription(promptFragment.id, promptFragment.customizationId);
            setDescription(customizationDescription || '');
        };
        fetchDescription();
    }, [promptFragment.id, promptFragment.customizationId, promptService]);
    return <span className='prompt-customization-description'>{description}</span>;
};
