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
import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';
import { AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-section';
import { AiSettingsControl, AiSettingsRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { SAMPLE_REVIEW_BOT_ENABLED_PREF, SAMPLE_REVIEW_BOT_REVIEWER_NAME_PREF } from './sample-review-bot-preferences';

/** A single setting row within the sample category; label/description come from the schema. */
interface ReviewBotSettingSpec {
    readonly preferenceId: string;
    readonly control: AiSettingsControl;
}

/**
 * Sample `single-page` AI configuration category contributed by `@theia/api-samples`. It sets
 * `contributed: true`, so it appears under "Contributed by extensions" in the AI Configuration
 * view. It uses only the public {@link AiConfigurationCategory} contribution point and the shared
 * primitives ({@link SinglePageCategoryRenderer}, {@link AiConfigurationSection}, {@link AiSettingsRow}),
 * proving an extension can add a category with no privileged access and have it render identically
 * to the built-ins and participate in deep search.
 */
@injectable()
export class SampleReviewBotConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = 'sample-review-bot';
    readonly label = nls.localize('theia/api-samples/reviewBot/label', 'Review Bot');
    readonly iconClass = codicon('feedback');
    readonly kind = 'single-page' as const;
    readonly contributed = true;

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

    /** The settings shown on the page and mirrored into the search index. */
    protected getSettings(): ReviewBotSettingSpec[] {
        return [
            { preferenceId: SAMPLE_REVIEW_BOT_ENABLED_PREF, control: { type: 'boolean' } },
            { preferenceId: SAMPLE_REVIEW_BOT_REVIEWER_NAME_PREF, control: { type: 'string' } }
        ];
    }

    protected renderSections(ctx: AiConfigurationRenderContext): React.ReactNode {
        return <AiConfigurationSection title={nls.localize('theia/api-samples/reviewBot/section', 'Review Bot')}>
            {this.getSettings().map(setting => <AiSettingsRow
                key={setting.preferenceId}
                service={this.settingsRowService}
                preferenceId={setting.preferenceId}
                scope={ctx.scope}
                control={setting.control}
                onDidChange={ctx.update}
            />)}
        </AiConfigurationSection>;
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const settingLabel = nls.localizeByDefault('Setting');
        return this.getSettings().map(setting => {
            const described = this.settingsRowService.describe(setting.preferenceId);
            return {
                label: described.label ?? setting.preferenceId,
                typeLabel: settingLabel,
                categoryId: this.id,
                target: { categoryId: this.id, highlight: { rowId: setting.preferenceId } },
                keywords: setting.preferenceId
            } satisfies AiConfigurationSearchItem;
        });
    }
}

export function bindSampleReviewBotConfigurationCategory(bind: interfaces.Bind): void {
    bind(SampleReviewBotConfigurationCategory).toSelf().inSingletonScope();
    bind(AiConfigurationCategory).toService(SampleReviewBotConfigurationCategory);
}
