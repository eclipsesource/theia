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

import { ContainerModule, inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, SelectionService } from '@theia/core';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { AIDER_CONNECTOR_PATH, AiderConnector, AiderConnectorClient } from '../common/api';
import { ChatAgent } from '@theia/ai-chat';
import { AiderChatAgent } from './aider-chat-agent';
import { AiderConnectorClientImpl } from './aider-connector-client';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';

export default new ContainerModule(bind => {
    bind(CommandContribution).to(AiderCommandContribution);
    bind(AiderConnectorClient).to(AiderConnectorClientImpl).inSingletonScope();
    bind(AiderConnector).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const client = ctx.container.get<AiderConnectorClient>(AiderConnectorClient);
        return provider.createProxy<AiderConnector>(AIDER_CONNECTOR_PATH, client);
    }).inSingletonScope();
    bind(ChatAgent).to(AiderChatAgent).inSingletonScope();
    bind(MenuContribution).to(AiderMenuContribution);
});

export const AiderAddCommand: Command = {
    id: 'ai.aider.add',
    label: 'Add to Aider'
};

@injectable()
export class AiderCommandContribution implements CommandContribution {
    @inject(AiderConnector)
    private connector: AiderConnector;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({
            id: 'aider:open',
            label: 'Start Aider'
        }, {
            execute: () => {
                this.connector.startAider();
                this.connector.sendMessage('What is this project about?');
            }
        });
        commands.registerCommand(AiderAddCommand, UriAwareCommandHandler.MultiSelect(this.selectionService, {
            execute: uris => {
                const workspaceRoot = this.workspaceService.getWorkspaceRootUri(uris[0]);
                if (workspaceRoot) {
                    const paths = uris.map(uri => workspaceRoot.relative(uri)?.fsPath());
                    if (paths) {
                        this.connector.add(paths);
                    }
                }
            }
        }));
    }
}
@injectable()
export class AiderMenuContribution implements MenuContribution {
    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(['navigator-context-menu', 'navigation'], {
            commandId: AiderAddCommand.id,
            order: 'z'
        });
    }
}
