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
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core';
import { CommonCommands } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatViewTreeWidget, isRequestNode, isResponseNode, RequestNode, ResponseNode } from './chat-tree-view/chat-view-tree-widget';
import { ChatInputWidget } from './chat-input-widget';

export namespace ChatViewCommands {
    export const COPY_ALL = Command.toDefaultLocalizedCommand({
        id: 'core.copy.all',
        label: 'Copy All'
    });
    export const COPY_CODE = Command.toDefaultLocalizedCommand({
        id: 'core.copy.code',
        label: 'Copy Code Block'
    });
}

@injectable()
export class ChatViewMenuContribution implements MenuContribution, CommandContribution {

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ChatViewCommands.COPY_ALL, {
            execute: (...args) => {
                if (isRequestOrResponseNode(args)) {
                    const text = args.map(arg => {
                        if (isRequestNode(arg)) {
                            return arg.request.request.text;
                        } else if (isResponseNode(arg)) {
                            return arg.response.response.asString();
                        }
                    }).join();
                    this.clipboardService.writeText(text);
                }
            },
            isEnabled: (...args) => isRequestOrResponseNode(args)
        });
        commands.registerCommand(ChatViewCommands.COPY_CODE, {
            execute: (...args) => {
                if (containsCode(args)) {
                    const code = args.filter(arg => 'code' in arg).map(arg => arg.code).join();
                    this.clipboardService.writeText(code);
                }
            },
            isEnabled: (...args) => isRequestOrResponseNode(args) && containsCode(args)
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...ChatViewTreeWidget.CONTEXT_MENU, '_1'], {
            commandId: CommonCommands.COPY.id
        });
        menus.registerMenuAction([...ChatViewTreeWidget.CONTEXT_MENU, '_1'], {
            commandId: ChatViewCommands.COPY_ALL.id
        });
        menus.registerMenuAction([...ChatViewTreeWidget.CONTEXT_MENU, '_1'], {
            commandId: ChatViewCommands.COPY_CODE.id
        });
        menus.registerMenuAction([...ChatInputWidget.CONTEXT_MENU, '_1'], {
            commandId: CommonCommands.COPY.id
        });
        menus.registerMenuAction([...ChatInputWidget.CONTEXT_MENU, '_1'], {
            commandId: CommonCommands.PASTE.id
        });
    }

}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isRequestOrResponseNode(args: any[]): args is (RequestNode | ResponseNode)[] {
    return args.filter(arg => isRequestNode(arg) || isResponseNode(arg)).length > 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function containsCode(args: any[]): args is (any | { code: string })[] {
    return args.filter(arg => 'code' in arg).length > 0;
}

