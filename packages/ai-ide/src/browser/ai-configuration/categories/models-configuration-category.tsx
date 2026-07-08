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
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AiGeneralPageHeader, AiGeneralSection, AiGeneralSettingControl, AiGeneralSettingRow } from '../components/ai-general-settings-layout';

/** Prefix shared by every AI preference. */
const AI_FEATURES_PREFIX = 'ai-features.';

/** Id of the cross-provider "Model Settings" section (kept in the overview, not a provider node). */
const MODEL_SETTINGS_ID = 'model-settings';

/**
 * Second path segments under `ai-features.*` that belong to other categories and must not be
 * treated as language-model providers when the Models page discovers provider blocks.
 */
const NON_PROVIDER_SEGMENTS = new Set<string>([
    'AiEnable', 'chat', 'notifications', 'orchestrator', 'agentMode',
    'skills', 'promptTemplates', 'languageModelAliases', 'mcp',
    'modelSettings', 'reasoning'
]);

/** Segments that make up the cross-provider "Model Settings" section. */
const MODEL_SETTINGS_SEGMENTS = new Set<string>(['modelSettings', 'reasoning']);

interface ModelsSection {
    readonly id: string;
    readonly title: string;
    readonly preferenceIds: string[];
}

/**
 * The Models category: a `collection` listing each language-model provider as a tree child, so
 * providers appear as nodes under the Models category. Provider blocks are discovered from the
 * registered `ai-features.<provider>.*` preferences, so any installed provider package contributes
 * a node here without ai-ide having to depend on it.
 *
 * The page adopts the shared "AI Features" (General) style — a sticky header plus {@link AiGeneralSection}
 * settings sections — so Models and General render consistently. The overview shows the cross-provider
 * model settings (`ai-features.modelSettings.*`, `ai-features.reasoning.*`) and the provider list;
 * selecting a provider node shows that provider's settings.
 */
@injectable()
export class ModelsConfigurationCategory implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.MODELS;
    readonly label = nls.localizeByDefault('Models');
    readonly iconClass = codicon('chip');
    readonly order = AiConfigurationCategoryOrder.MODELS;
    readonly kind = 'collection' as const;

    @inject(AiSettingsRowService)
    protected readonly settingsRowService: AiSettingsRowService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    /** Bound markdown renderer passed to the shared setting rows (stable identity for `useEffect`). */
    protected readonly renderMarkdown = (markdown: string): HTMLElement => this.settingsRowService.renderMarkdown(markdown);

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.settingsRowService.onPreferenceChanged(() => this.onDidChangeEmitter.fire()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /** One tree child per discovered provider (the cross-provider model settings stay in the overview). */
    getTreeChildren(): AiConfigurationTreeItem[] {
        return this.getProviderSections().map(section => ({
            id: section.id,
            label: section.title,
            iconClass: this.iconClass
        } satisfies AiConfigurationTreeItem));
    }

    /** Category overview (no node selected): the cross-provider model settings plus the provider list. */
    renderOverview(ctx: AiConfigurationRenderContext): React.ReactNode {
        const modelSettings = this.getModelSettingsSection();
        const providers = this.getProviderSections();
        return <div className='ai-general-page'>
            <AiGeneralPageHeader
                crumbs={[nls.localizeByDefault('Preferences'), this.label]}
                title={this.label}
                subtitle={nls.localize('theia/ai/ide/modelsConfiguration/pageSubtitle',
                    'Configure the language-model providers and cross-provider model defaults.')}
            />
            {modelSettings && <AiGeneralSection title={modelSettings.title}>
                {modelSettings.preferenceIds.map(preferenceId => this.renderPreferenceRow(ctx, preferenceId))}
            </AiGeneralSection>}
            <AiGeneralSection title={nls.localize('theia/ai/ide/modelsConfiguration/providers', 'Providers')}>
                {providers.length === 0
                    ? <div className='ai-general-empty'>
                        {nls.localize('theia/ai/ide/modelsConfiguration/noProviders', 'No language-model providers are installed.')}
                    </div>
                    : providers.map(section => this.renderProviderNavRow(section, ctx))}
            </AiGeneralSection>
        </div>;
    }

    /** Provider detail (node selected): that provider's settings. */
    renderItemDetail(itemId: string, ctx: AiConfigurationRenderContext): React.ReactNode {
        const section = this.getProviderSections().find(candidate => candidate.id === itemId);
        if (!section) {
            return undefined;
        }
        return <div className='ai-general-page'>
            <AiGeneralPageHeader
                crumbs={[nls.localizeByDefault('Preferences'), this.label, section.title]}
                title={section.title}
            />
            <AiGeneralSection title={nls.localizeByDefault('Settings')}>
                {section.preferenceIds.map(preferenceId => this.renderPreferenceRow(ctx, preferenceId))}
            </AiGeneralSection>
        </div>;
    }

    protected renderProviderNavRow(section: ModelsSection, ctx: AiConfigurationRenderContext): React.ReactNode {
        return <button
            key={section.id}
            type='button'
            className='ai-general-setting ai-general-nav-row'
            onClick={() => ctx.navigate({ categoryId: this.id, itemId: section.id })}
        >
            <div className='ai-general-setting-top'>
                <div className='ai-general-setting-main'>
                    <div className='ai-general-setting-title'>{section.title}</div>
                </div>
                <span className={`ai-general-nav-chevron ${codicon('chevron-right')}`}></span>
            </div>
        </button>;
    }

    protected renderPreferenceRow(ctx: AiConfigurationRenderContext, preferenceId: string): React.ReactNode {
        const inspection = this.settingsRowService.inspect(preferenceId, ctx.scope);
        const described = this.settingsRowService.describe(preferenceId);
        const label = described.label ?? preferenceId;
        return <AiGeneralSettingRow
            key={preferenceId}
            preferenceId={preferenceId}
            title={label}
            description={described.description}
            renderMarkdown={this.renderMarkdown}
            modified={inspection.modified}
            onReset={() => this.reset(preferenceId, ctx)}
            control={<AiGeneralSettingControl
                control={this.settingsRowService.controlFor(preferenceId)}
                value={inspection.value}
                ariaLabel={label}
                onCommit={value => this.commit(preferenceId, value, ctx)}
            />}
        />;
    }

    protected commit(preferenceId: string, value: unknown, ctx: AiConfigurationRenderContext): void {
        this.settingsRowService.set(preferenceId, value, ctx.scope).then(() => ctx.update());
    }

    protected reset(preferenceId: string, ctx: AiConfigurationRenderContext): void {
        this.settingsRowService.reset(preferenceId, ctx.scope).then(() => ctx.update());
    }

    /** Discovers the model-settings and provider sections from the registered preference schema. */
    protected getSections(): ModelsSection[] {
        const modelSettings: string[] = [];
        const byProvider = new Map<string, string[]>();
        for (const preferenceId of this.settingsRowService.preferenceIds()) {
            if (!preferenceId.startsWith(AI_FEATURES_PREFIX)) {
                continue;
            }
            const segment = preferenceId.substring(AI_FEATURES_PREFIX.length).split('.')[0];
            if (MODEL_SETTINGS_SEGMENTS.has(segment)) {
                modelSettings.push(preferenceId);
            } else if (!NON_PROVIDER_SEGMENTS.has(segment)) {
                const block = byProvider.get(segment) ?? [];
                block.push(preferenceId);
                byProvider.set(segment, block);
            }
        }

        const sections: ModelsSection[] = [];
        if (modelSettings.length > 0) {
            sections.push({
                id: MODEL_SETTINGS_ID,
                title: nls.localize('theia/ai/ide/modelsConfiguration/modelSettings', 'Model Settings'),
                preferenceIds: modelSettings
            });
        }
        for (const provider of Array.from(byProvider.keys()).sort()) {
            sections.push({ id: provider, title: provider, preferenceIds: byProvider.get(provider)! });
        }
        return sections;
    }

    /** The cross-provider "Model Settings" section, if any settings are registered for it. */
    protected getModelSettingsSection(): ModelsSection | undefined {
        return this.getSections().find(section => section.id === MODEL_SETTINGS_ID);
    }

    /** The provider sections (everything except the cross-provider "Model Settings"). */
    protected getProviderSections(): ModelsSection[] {
        return this.getSections().filter(section => section.id !== MODEL_SETTINGS_ID);
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const settingLabel = nls.localizeByDefault('Setting');
        return this.getSections().flatMap(section => {
            // Provider settings live in the provider's node; model settings live in the overview.
            const isProvider = section.id !== MODEL_SETTINGS_ID;
            return section.preferenceIds.map(preferenceId => {
                const described = this.settingsRowService.describe(preferenceId);
                return {
                    label: described.label ?? preferenceId,
                    typeLabel: settingLabel,
                    categoryId: this.id,
                    target: {
                        categoryId: this.id,
                        itemId: isProvider ? section.id : undefined,
                        highlight: { rowId: preferenceId }
                    },
                    keywords: `${preferenceId} ${section.title}`
                } satisfies AiConfigurationSearchItem;
            });
        });
    }
}
