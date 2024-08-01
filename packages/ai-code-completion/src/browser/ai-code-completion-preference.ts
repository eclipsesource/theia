// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';
import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/browser/ai-core-preferences';

export const PREF_CODE_COMPLETION_ENABLE = 'ai-features.code-completion.enable';
export const PREF_CODE_COMPLETION_PRECOMPUTE = 'ai-features.code-completion.precompute';

export const AICodeCompletionPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [PREF_CODE_COMPLETION_ENABLE]: {
            title: AI_CORE_PREFERENCES_TITLE,
            type: 'boolean',
            description: 'Enable AI code completion',
            default: false
        },
        [PREF_CODE_COMPLETION_PRECOMPUTE]: {
            title: AI_CORE_PREFERENCES_TITLE,
            type: 'boolean',
            description: 'Precompute completion before it is triggered',
            default: false
        }
    }
};
