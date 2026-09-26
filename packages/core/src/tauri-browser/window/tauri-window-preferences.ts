// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls, PreferenceScope } from '../../common';
import { PreferenceSchema } from '../../common/preferences/preference-schema';
import { PREF_WINDOW_ZOOM_LEVEL, ZoomLevel } from '../../electron-common/electron-window-preferences';

export const tauriWindowPreferencesSchema: PreferenceSchema = {
    properties: {
        [PREF_WINDOW_ZOOM_LEVEL]: {
            type: 'number',
            default: ZoomLevel.DEFAULT,
            minimum: ZoomLevel.MIN,
            maximum: ZoomLevel.MAX,
            scope: PreferenceScope.User,
            description: nls.localize('theia/core/window/zoomLevelPref',
                'Adjust the default zoom level for all windows. Each increment of 0.5 changes the scale by about 10%.')
        }
    }
};
