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

export const API_KEY_PREF = 'AI - Open AI.api-key';
export const MODELS_PREF = 'AI - Open AI.models';

export const OpenAiPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [API_KEY_PREF]: {
            type: 'string',
            description: 'OpenAI API Key',
        },
        [MODELS_PREF]: {
            type: 'array',
            default: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
            items: {
                type: 'string'
            }
        }
    }
};