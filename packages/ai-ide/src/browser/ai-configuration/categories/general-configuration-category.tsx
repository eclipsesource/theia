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

import {
    PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE,
    PREFERENCE_NAME_MAX_RETRIES,
    PREFERENCE_NAME_PROMPT_TEMPLATES
} from '@theia/ai-core/lib/common/ai-core-preferences';
import {
    BYPASS_MODEL_REQUIREMENT_PREF,
    PERSISTED_SESSION_LIMIT_PREF,
    PIN_CHAT_AGENT_PREF,
    SESSION_STORAGE_PREF,
    WELCOME_SCREEN_SESSIONS_PREF
} from '@theia/ai-chat/lib/common/ai-chat-preferences';
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
import { AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-section';
import { AiSettingsControl, AiSettingsRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { PREFERENCE_NAME_AGENT_MODE_ENABLED, PREFERENCE_NAME_ENABLE_AI, PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST } from '../../../common/ai-ide-preferences';

/** A single setting row within a {@link GeneralSettingsSection}; label/description come from the schema. */
interface GeneralSettingSpec {
    readonly preferenceId: string;
    readonly control: AiSettingsControl;
}

interface GeneralSettingsSection {
    readonly title: string;
    readonly settings: GeneralSettingSpec[];
}

/**
 * The General category: a `single-page` category aggregating the top-level `ai-features.*`
 * preferences (feature enablement, chat behaviour, notifications) onto {@link AiSettingsRow}s.
 * Labels and descriptions are read from each preference's registered schema.
 */
@injectable()
export class GeneralConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.GENERAL;
    readonly label = nls.localize('theia/ai/ide/generalConfiguration/label', 'General');
    readonly iconClass = codicon('settings-gear');
    readonly order = AiConfigurationCategoryOrder.GENERAL;
    readonly kind = 'single-page' as const;

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
        // Refresh the page (modified indicators, values) whenever any preference changes.
        this.toDispose.push(this.settingsRowService.onPreferenceChanged(() => this.onDidChangeEmitter.fire()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /** The sections and their settings, shared by the page and the search index. */
    protected getSections(): GeneralSettingsSection[] {
        return [
            {
                title: nls.localize('theia/ai/ide/generalConfiguration/aiFeatures', 'AI Features'),
                settings: [
                    { preferenceId: PREFERENCE_NAME_ENABLE_AI, control: { type: 'boolean' } },
                    { preferenceId: PREFERENCE_NAME_AGENT_MODE_ENABLED, control: { type: 'boolean' } },
                    { preferenceId: PREFERENCE_NAME_PROMPT_TEMPLATES, control: { type: 'string' } },
                    { preferenceId: PREFERENCE_NAME_MAX_RETRIES, control: { type: 'number', min: 0 } },
                    { preferenceId: PREFERENCE_NAME_ORCHESTRATOR_EXCLUSION_LIST, control: { type: 'array' } }
                ]
            },
            {
                title: nls.localizeByDefault('Chat'),
                settings: [
                    { preferenceId: PIN_CHAT_AGENT_PREF, control: { type: 'boolean' } },
                    { preferenceId: BYPASS_MODEL_REQUIREMENT_PREF, control: { type: 'boolean' } },
                    { preferenceId: PERSISTED_SESSION_LIMIT_PREF, control: { type: 'number', min: -1 } },
                    { preferenceId: WELCOME_SCREEN_SESSIONS_PREF, control: { type: 'number', min: 0 } },
                    { preferenceId: SESSION_STORAGE_PREF, control: { type: 'select', options: this.settingsRowService.enumOptions(SESSION_STORAGE_PREF) } }
                ]
            },
            {
                title: nls.localizeByDefault('Notifications'),
                settings: [
                    {
                        preferenceId: PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE,
                        control: { type: 'select', options: this.settingsRowService.enumOptions(PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE) }
                    }
                ]
            }
        ];
    }

    protected renderSections(ctx: AiConfigurationRenderContext): React.ReactNode {
        return this.getSections().map(section =>
            <AiConfigurationSection key={section.title} title={section.title}>
                {section.settings.map(setting => <AiSettingsRow
                    key={setting.preferenceId}
                    service={this.settingsRowService}
                    preferenceId={setting.preferenceId}
                    scope={ctx.scope}
                    control={setting.control}
                    onDidChange={ctx.update}
                />)}
            </AiConfigurationSection>);
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const settingLabel = nls.localizeByDefault('Setting');
        return this.getSections().flatMap(section => section.settings.map(setting => {
            const described = this.settingsRowService.describe(setting.preferenceId);
            return {
                label: described.label ?? setting.preferenceId,
                typeLabel: settingLabel,
                categoryId: this.id,
                target: { categoryId: this.id, highlight: { rowId: setting.preferenceId } },
                keywords: `${setting.preferenceId} ${section.title}`
            } satisfies AiConfigurationSearchItem;
        }));
    }
}
