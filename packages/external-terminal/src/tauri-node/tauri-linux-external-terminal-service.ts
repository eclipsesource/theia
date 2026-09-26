// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';
import { injectable } from '@theia/core/shared/inversify';
import { ExternalTerminalConfiguration } from '../common/external-terminal';
import { LinuxExternalTerminalService } from '../electron-node/linux-external-terminal-service';

@injectable()
export class TauriLinuxExternalTerminalService extends LinuxExternalTerminalService {
    override openTerminal(configuration: ExternalTerminalConfiguration, cwd: string): Promise<void> {
        const uri = new URI(cwd);
        if (uri.scheme !== 'file' || uri.authority) {
            return Promise.reject(new Error('Tauri external terminal requires a local workspace directory'));
        }
        return super.openTerminal(configuration, cwd);
    }
}
