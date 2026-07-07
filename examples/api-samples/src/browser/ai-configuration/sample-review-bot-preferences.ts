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

import { nls, PreferenceContribution } from '@theia/core';
import { interfaces } from '@theia/core/shared/inversify';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';

/** Whether the sample "Review Bot" is active. */
export const SAMPLE_REVIEW_BOT_ENABLED_PREF = 'sampleReviewBot.enabled';
/** The display name the sample "Review Bot" signs its comments with. */
export const SAMPLE_REVIEW_BOT_REVIEWER_NAME_PREF = 'sampleReviewBot.reviewerName';

/**
 * Preferences backing the sample "Review Bot" AI configuration category. They exist purely so the
 * sample category has real settings to bind its {@link AiSettingsRow}s to; the labels and
 * descriptions declared here are what the rows and the search index display.
 */
export const sampleReviewBotPreferenceSchema: PreferenceSchema = {
    properties: {
        [SAMPLE_REVIEW_BOT_ENABLED_PREF]: {
            type: 'boolean',
            title: nls.localize('theia/api-samples/reviewBot/enabled/title', 'Review Bot'),
            markdownDescription: nls.localize('theia/api-samples/reviewBot/enabled/description',
                'Enable the sample Review Bot. This is a demonstration category contributed by `@theia/api-samples` to show extensions can add AI configuration categories.'),
            default: false
        },
        [SAMPLE_REVIEW_BOT_REVIEWER_NAME_PREF]: {
            type: 'string',
            title: nls.localize('theia/api-samples/reviewBot/reviewerName/title', 'Reviewer Name'),
            markdownDescription: nls.localize('theia/api-samples/reviewBot/reviewerName/description',
                'The display name the sample Review Bot signs its comments with.'),
            default: 'Review Bot'
        }
    }
};

export function bindSampleReviewBotPreferences(bind: interfaces.Bind): void {
    bind(PreferenceContribution).toConstantValue({ schema: sampleReviewBotPreferenceSchema });
}
