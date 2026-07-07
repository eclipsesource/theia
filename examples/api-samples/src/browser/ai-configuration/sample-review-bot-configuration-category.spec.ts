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
import { SampleReviewBotConfigurationCategory } from './sample-review-bot-configuration-category';
import { SAMPLE_REVIEW_BOT_ENABLED_PREF, SAMPLE_REVIEW_BOT_REVIEWER_NAME_PREF } from './sample-review-bot-preferences';

disableJSDOM();

describe('SampleReviewBotConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares a contributed single-page category', () => {
        const category = new SampleReviewBotConfigurationCategory();
        expect(category.id).to.equal('sample-review-bot');
        expect(category.kind).to.equal('single-page');
        expect(category.contributed).to.equal(true);
    });

    it('indexes both settings for search, targeting the category with a row highlight', () => {
        const category = new SampleReviewBotConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).settingsRowService = { describe: (id: string) => ({ label: id }) };

        const items = category.getSearchItems();
        expect(items.map(i => i.target.highlight?.rowId)).to.deep.equal([SAMPLE_REVIEW_BOT_ENABLED_PREF, SAMPLE_REVIEW_BOT_REVIEWER_NAME_PREF]);
        expect(items.every(i => i.target.categoryId === 'sample-review-bot' && i.target.itemId === undefined)).to.equal(true);
    });
});
