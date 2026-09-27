// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common';
import { KeybindingContribution, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ExternalTerminalService, externalTerminalServicePath } from '../common/external-terminal';
import { ExternalTerminalFrontendContribution } from '../electron-browser/external-terminal-contribution';
import { bindExternalTerminalPreferences } from '../electron-browser/external-terminal-preference';

export default new ContainerModule(bind => {
    bind(ExternalTerminalFrontendContribution).toSelf().inSingletonScope();
    bindExternalTerminalPreferences(bind);
    bind(CommandContribution).toService(ExternalTerminalFrontendContribution);
    bind(KeybindingContribution).toService(ExternalTerminalFrontendContribution);
    bind(ExternalTerminalService).toDynamicValue(context =>
        ServiceConnectionProvider.createLocalProxy<ExternalTerminalService>(context.container, externalTerminalServicePath)
    ).inSingletonScope();
});
