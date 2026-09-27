// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { tauriRemoteSessionParam } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { DevContainerStartupContribution } from '../electron-browser/dev-container-startup-contribution';

@injectable()
export class TauriDevContainerStartupContribution extends DevContainerStartupContribution {
    protected override openRemote(id: string, _newWindow: boolean, workspace?: string): void {
        this.windowService.reload({ search: { [tauriRemoteSessionParam]: id }, hash: workspace });
    }
}
