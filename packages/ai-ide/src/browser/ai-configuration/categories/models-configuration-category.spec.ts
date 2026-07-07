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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { AiSettingsControl, AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { ModelsConfigurationCategory } from './models-configuration-category';

disableJSDOM();

function createCategory(preferenceIds: string[]): ModelsConfigurationCategory {
    const category = new ModelsConfigurationCategory();
    const service: Partial<AiSettingsRowService> = {
        preferenceIds: () => preferenceIds,
        describe: (id: string) => ({ label: `label:${id}` }),
        controlFor: (): AiSettingsControl => ({ type: 'string' })
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).settingsRowService = service;
    return category;
}

describe('ModelsConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the models single-page metadata', () => {
        const category = createCategory([]);
        expect(category.id).to.equal(AiConfigurationCategoryId.MODELS);
        expect(category.kind).to.equal('single-page');
        expect(category.renderer).to.equal(category);
    });

    it('groups model settings and one section per discovered provider, ignoring other categories', () => {
        const category = createCategory([
            'ai-features.modelSettings.requestSettings',
            'ai-features.reasoning.defaults',
            'ai-features.anthropic.AnthropicApiKey',
            'ai-features.anthropic.AnthropicModels',
            'ai-features.google.apiKey',
            // must be ignored: owned by other categories / unrelated
            'ai-features.chat.pinChatAgent',
            'ai-features.AiEnable.enableAI',
            'editor.fontSize'
        ]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sections = (category as any).getSections() as Array<{ id: string; preferenceIds: string[] }>;
        expect(sections.map(s => s.id)).to.deep.equal(['model-settings', 'anthropic', 'google']);
        expect(sections[0].preferenceIds).to.have.members(['ai-features.modelSettings.requestSettings', 'ai-features.reasoning.defaults']);
        expect(sections[1].preferenceIds).to.deep.equal(['ai-features.anthropic.AnthropicApiKey', 'ai-features.anthropic.AnthropicModels']);
        expect(sections[2].preferenceIds).to.deep.equal(['ai-features.google.apiKey']);
    });

    it('indexes each discovered setting for deep search', () => {
        const category = createCategory(['ai-features.anthropic.AnthropicApiKey']);
        const items = category.getSearchItems();
        expect(items).to.have.lengthOf(1);
        expect(items[0].target).to.deep.equal({
            categoryId: AiConfigurationCategoryId.MODELS,
            highlight: { rowId: 'ai-features.anthropic.AnthropicApiKey' }
        });
    });
});
