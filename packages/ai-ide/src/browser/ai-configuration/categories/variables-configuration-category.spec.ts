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
import { AIVariable, AIVariableService } from '@theia/ai-core/lib/common';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { VariablesConfigurationCategory } from './variables-configuration-category';

disableJSDOM();

function variable(id: string, name: string, description = ''): AIVariable {
    return { id, name, description } as unknown as AIVariable;
}

function createCategory(variables: AIVariable[]): VariablesConfigurationCategory {
    const category = new VariablesConfigurationCategory();
    const variableService: Partial<AIVariableService> = { getVariables: () => variables };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).variableService = variableService;
    return category;
}

describe('VariablesConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the variables collection metadata', () => {
        const category = createCategory([]);
        expect(category.id).to.equal(AiConfigurationCategoryId.VARIABLES);
        expect(category.kind).to.equal('collection');
        expect(category.renderer).to.equal(category);
    });

    it('lists variables sorted by name, without a status', () => {
        const children = createCategory([variable('b', 'Beta'), variable('a', 'Alpha', 'first')]).getTreeChildren();
        expect(children.map(c => c.label)).to.deep.equal(['Alpha', 'Beta']);
        expect(children[0].id).to.equal('a');
        expect(children[0].description).to.equal('first');
        expect(children[0].status).to.equal(undefined);
    });

    it('indexes one search item per variable, navigating to the item', () => {
        const items = createCategory([variable('a', 'Alpha', 'the alpha')]).getSearchItems();
        expect(items).to.have.lengthOf(1);
        expect(items[0].target).to.deep.equal({ categoryId: AiConfigurationCategoryId.VARIABLES, itemId: 'a' });
        expect(items[0].keywords).to.contain('a').and.to.contain('the alpha');
    });
});
