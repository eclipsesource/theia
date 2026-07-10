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
import { AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-section';
import { AiConfigurationItemCard } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-item-card';
import { AiConfigurationEmptyState } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-empty-state';
import { AiSettingsRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row';

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
    'modelSettings', 'reasoning', 'agentSettings'
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
 * The page uses the shared {@link AiConfigurationSection} settings sections so every category renders
 * consistently. The overview shows the cross-provider model settings (`ai-features.modelSettings.*`,
 * `ai-features.reasoning.*`) and the providers as a card grid; selecting a provider node shows that
 * provider's settings.
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

    /** Category overview (no node selected): the cross-provider model settings plus the provider cards. */
    renderOverview(ctx: AiConfigurationRenderContext): React.ReactNode {
        const modelSettings = this.getModelSettingsSection();
        const providers = this.getProviderSections();
        return <div className='ai-configuration-page'>
            {modelSettings && <AiConfigurationSection title={modelSettings.title}>
                {modelSettings.preferenceIds.map(preferenceId => this.renderPreferenceRow(ctx, preferenceId))}
            </AiConfigurationSection>}
            <AiConfigurationSection title={nls.localize('theia/ai/ide/modelsConfiguration/providers', 'Providers')}>
                {providers.length === 0
                    ? <AiConfigurationEmptyState
                        message={nls.localize('theia/ai/ide/modelsConfiguration/noProviders', 'No language-model providers are installed.')}
                    />
                    : <div className='ai-configuration-card-grid'>
                        {providers.map(section => <AiConfigurationItemCard
                            key={section.id}
                            label={section.title}
                            iconClass={this.iconClass}
                            onSelect={() => ctx.navigate({ categoryId: this.id, itemId: section.id })}
                        />)}
                    </div>}
            </AiConfigurationSection>
        </div>;
    }

    /** Provider detail (node selected): that provider's settings. */
    renderItemDetail(itemId: string, ctx: AiConfigurationRenderContext): React.ReactNode {
        const section = this.getProviderSections().find(candidate => candidate.id === itemId);
        if (!section) {
            return undefined;
        }
        return <div className='ai-configuration-page'>
            <AiConfigurationSection title={nls.localizeByDefault('Settings')}>
                {section.preferenceIds.map(preferenceId => this.renderPreferenceRow(ctx, preferenceId))}
            </AiConfigurationSection>
        </div>;
    }

    protected renderPreferenceRow(ctx: AiConfigurationRenderContext, preferenceId: string): React.ReactNode {
        return <AiSettingsRow
            key={preferenceId}
            service={this.settingsRowService}
            preferenceId={preferenceId}
            scope={ctx.scope}
            control={this.settingsRowService.controlFor(preferenceId)}
            onDidChange={() => ctx.update()}
        />;
    }

    /** Discovers the model-settings and provider sections from the registered preference schema. */
    protected getSections(): ModelsSection[] {
        const modelSettings: string[] = [];
        const byProvider = new Map<string, string[]>();
        for (const preferenceId of this.settingsRowService.preferenceIds()) {
            if (!preferenceId.startsWith(AI_FEATURES_PREFIX) || !this.settingsRowService.isDisplayable(preferenceId)) {
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
        const providerSections = Array.from(byProvider.entries()).map(([provider, preferenceIds]) => ({
            id: provider,
            title: this.getProviderLabel(provider, preferenceIds),
            preferenceIds
        } satisfies ModelsSection));
        // Order provider nodes by the label the user actually sees, not by the raw preference segment.
        providerSections.sort((left, right) => left.title.localeCompare(right.title));
        sections.push(...providerSections);
        return sections;
    }

    /**
     * The human-readable display name for a provider block. A provider declares it in its preference
     * schema (via the `aiModelProvider` `typeDetails`, `MODEL_PROVIDER_TYPE_DETAIL`), so this
     * package does not have to know provider names. Providers that declare no name (e.g. third-party
     * packages) fall back to a prettified form of the `ai-features.<provider>.*` segment.
     */
    protected getProviderLabel(providerId: string, preferenceIds: string[]): string {
        for (const preferenceId of preferenceIds) {
            const declared = this.settingsRowService.modelProviderLabel(preferenceId);
            if (declared) {
                return declared;
            }
        }
        return this.prettifyProviderId(providerId);
    }

    /** Turns an unknown provider segment such as `myProvider` or `my-provider` into `My Provider`. */
    protected prettifyProviderId(providerId: string): string {
        const spaced = providerId
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/[-_]+/g, ' ')
            .trim();
        return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
