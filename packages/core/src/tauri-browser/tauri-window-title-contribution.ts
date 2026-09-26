// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named } from 'inversify';
import { ILogger } from '../common/logger';
import { FrontendApplicationContribution } from '../browser/frontend-application-contribution';
import { WindowTitleService } from '../browser/window/window-title-service';
import { FrontendApplicationConfigProvider } from '../browser/frontend-application-config-provider';
import { TauriNativeService } from '../tauri-common/tauri-native-service';

@injectable()
export class TauriWindowTitleContribution implements FrontendApplicationContribution {
    constructor(
        @inject(WindowTitleService) protected readonly titleService: WindowTitleService,
        @inject(TauriNativeService) protected readonly nativeService: TauriNativeService,
        @inject(ILogger) @named('core:TauriWindowTitleContribution') protected readonly logger: ILogger
    ) { }

    onStart(): void {
        this.updateTitle();
        this.titleService.onDidChangeTitle(() => this.updateTitle());
    }

    protected updateTitle(): void {
        const title = this.titleService.title || FrontendApplicationConfigProvider.get().applicationName;
        this.nativeService.setWindowTitle(title).catch(error => this.logger.warn('Could not update native window title:', error));
    }
}
