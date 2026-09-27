// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { FrontendApplicationContribution } from '../browser/frontend-application-contribution';
import { LocalConnectionProvider, ServiceConnectionProvider } from '../browser/messaging/service-connection-provider';
import { StopReason } from '../common/frontend-application-state';
import { TauriCloseClient, tauriCloseServicePath } from '../tauri-common/tauri-close-service';
import { TauriWindowService } from './window/tauri-window-service';

@injectable()
export class TauriCloseFrontendContribution implements FrontendApplicationContribution, TauriCloseClient {
    constructor(
        @inject(LocalConnectionProvider) protected readonly connectionProvider: ServiceConnectionProvider,
        @inject(TauriWindowService) protected readonly windowService: TauriWindowService
    ) { }

    onStart(): void {
        this.connectionProvider.createProxy<TauriCloseClient>(tauriCloseServicePath, this);
    }

    async confirmClose(): Promise<boolean> {
        if (!await this.windowService.isSafeToShutDown(StopReason.Close)) {
            return false;
        }
        this.windowService.prepareForNativeClose();
        return true;
    }
}
