// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named } from 'inversify';
import { ILogger } from '../../common/logger';
import { PreferenceService } from '../../common/preferences';
import { DefaultWindowService } from '../../browser/window/default-window-service';
import { FrontendApplication } from '../../browser/frontend-application';
import { PREF_WINDOW_ZOOM_LEVEL, ZoomLevel } from '../../electron-common/electron-window-preferences';
import { TauriNativeService } from '../../tauri-common/tauri-native-service';

@injectable()
export class TauriWindowService extends DefaultWindowService {
    @inject(TauriNativeService) protected readonly nativeService: TauriNativeService;
    @inject(ILogger) @named('core:TauriWindowService') protected readonly tauriLogger: ILogger;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

    override onStart(app: FrontendApplication): void {
        super.onStart(app);
        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === PREF_WINDOW_ZOOM_LEVEL) {
                this.updateWindowZoom();
            }
        });
        this.preferenceService.ready.then(() => this.updateWindowZoom());
    }

    override focus(): void {
        super.focus();
        this.nativeService.focusWindow().catch(error => this.tauriLogger.warn('Could not focus native window:', error));
    }

    /** The native host destroys the webview without dispatching `pagehide`. */
    prepareForNativeClose(): void {
        this.handlePageHide();
    }

    protected updateWindowZoom(): void {
        const zoomLevel = this.preferenceService.get<number>(PREF_WINDOW_ZOOM_LEVEL, ZoomLevel.DEFAULT);
        this.nativeService.setWindowZoom(zoomLevel).catch(error => this.tauriLogger.warn('Could not set native window zoom:', error));
    }
}
