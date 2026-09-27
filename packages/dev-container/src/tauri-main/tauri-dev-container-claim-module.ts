// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule, injectable } from '@theia/core/shared/inversify';
import { TauriMainApplicationContribution } from '@theia/core/lib/tauri-main/tauri-main-application';

@injectable()
export class TauriDevContainerClaimContribution implements TauriMainApplicationContribution {
    claimsLaunch(args: readonly string[]): boolean {
        return args.some((arg, index) => arg.startsWith('--attach-container=') && arg.length > '--attach-container='.length
            || arg === '--attach-container' && !!args[index + 1] && !args[index + 1].startsWith('--'));
    }
}

export default new ContainerModule(bind => {
    bind(TauriDevContainerClaimContribution).toSelf().inSingletonScope();
    bind(TauriMainApplicationContribution).toService(TauriDevContainerClaimContribution);
});
