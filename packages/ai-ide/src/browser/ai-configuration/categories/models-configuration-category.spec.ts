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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { AiSettingsControl, AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { ModelsConfigurationCategory } from './models-configuration-category';

disableJSDOM();

function createCategory(preferenceIds: string[], nonDisplayable: string[] = []): ModelsConfigurationCategory {
    const category = new ModelsConfigurationCategory();
    const hidden = new Set(nonDisplayable);
    const service: Partial<AiSettingsRowService> = {
        preferenceIds: () => preferenceIds,
        isDisplayable: (id: string) => !hidden.has(id),
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

    it('declares the models collection metadata', () => {
        const category = createCategory([]);
        expect(category.id).to.equal(AiConfigurationCategoryId.MODELS);
        expect(category.kind).to.equal('collection');
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

    it('does not treat the agent settings store as a provider', () => {
        const category = createCategory([
            'ai-features.anthropic.AnthropicApiKey',
            // agent settings: the hidden backing store and its value-less redirect placeholder
            'ai-features.agentSettings',
            'ai-features.agentSettings.details'
        ], ['ai-features.agentSettings', 'ai-features.agentSettings.details']);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sections = (category as any).getSections() as Array<{ id: string; preferenceIds: string[] }>;
        expect(sections.map(s => s.id)).to.deep.equal(['anthropic']);
    });

    it('exposes one tree child per provider, excluding the cross-provider model settings', () => {
        const category = createCategory([
            'ai-features.modelSettings.requestSettings',
            'ai-features.anthropic.AnthropicApiKey',
            'ai-features.google.apiKey'
        ]);
        const children = category.getTreeChildren();
        expect(children.map(c => c.id)).to.deep.equal(['anthropic', 'google']);
        expect(children.map(c => c.label)).to.deep.equal(['anthropic', 'google']);
    });

    it('indexes each setting for deep search, navigating provider settings to the provider node', () => {
        const category = createCategory([
            'ai-features.modelSettings.requestSettings',
            'ai-features.anthropic.AnthropicApiKey'
        ]);
        const items = category.getSearchItems();
        expect(items).to.have.lengthOf(2);
        // Cross-provider model settings navigate to the overview (no itemId).
        expect(items[0].target).to.deep.equal({
            categoryId: AiConfigurationCategoryId.MODELS,
            itemId: undefined,
            highlight: { rowId: 'ai-features.modelSettings.requestSettings' }
        });
        // Provider settings navigate to the provider node.
        expect(items[1].target).to.deep.equal({
            categoryId: AiConfigurationCategoryId.MODELS,
            itemId: 'anthropic',
            highlight: { rowId: 'ai-features.anthropic.AnthropicApiKey' }
        });
    });
});
