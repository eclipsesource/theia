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
import { PromptFragment } from '@theia/ai-core/lib/common/prompt-service';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { PromptsAndSkillsConfigurationCategory } from './prompts-and-skills-configuration-category';

disableJSDOM();

describe('PromptsAndSkillsConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the prompts-and-skills single-page metadata', () => {
        const category = new PromptsAndSkillsConfigurationCategory();
        expect(category.id).to.equal(AiConfigurationCategoryId.PROMPTS_AND_SKILLS);
        expect(category.kind).to.equal('single-page');
    });

    it('indexes variant sets, non-variant fragments, skills and slash commands for search', () => {
        const category = new PromptsAndSkillsConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).promptVariantsMap = new Map<string, string[]>([['system-set', ['system-set-a']]]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).promptFragmentMap = new Map<string, PromptFragment[]>([['system-set-a', []], ['standalone', []]]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).skills = [{ name: 'refactor', description: 'do it', location: '/s' } as unknown as Skill];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).slashCommands = [{ id: 'cmd', commandName: 'go', commandDescription: 'run' } as unknown as PromptFragment];

        const items = category.getSearchItems();
        const byType = (typeIncludes: string) => items.filter(i => i.typeLabel.toLowerCase().includes(typeIncludes));
        // 1 variant set + 1 non-variant fragment (`standalone`, not `system-set-a`) + 1 skill + 1 slash command
        expect(items).to.have.lengthOf(4);
        expect(byType('variant')).to.have.lengthOf(1);
        expect(items.find(i => i.label === 'standalone')).to.not.equal(undefined);
        expect(items.find(i => i.label === 'system-set-a')).to.equal(undefined);
        expect(items.every(i => i.target.categoryId === AiConfigurationCategoryId.PROMPTS_AND_SKILLS && i.target.itemId === undefined)).to.equal(true);
    });
});
