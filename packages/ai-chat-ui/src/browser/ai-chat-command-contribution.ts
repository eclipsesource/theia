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

import { COMMAND_CHAT_RESPONSE_COMMAND } from '@theia/ai-chat/lib/common';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MessageService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorContextMenu, EditorWidget } from '@theia/editor/lib/browser';

export interface AIChatCommandArguments {
    command: Command;
    handler?: (...commandArgs: unknown[]) => Promise<void>;
    arguments?: unknown[];
}

const COMMAND_DEMO_SAY_HELLO: Command = {
    id: 'theia-ai:greet-command',
    label: 'Say Hello'
};

const CHAT_EDITOR_START: Command = {
    id: 'theia-ai:chat:editor:start',
    label: 'Start Chat'
};

const CHAT_EDITOR_EXPLAIN_CODE: Command = {
    id: 'theia-ai:chat:editor:explain-code',
    label: 'Explain this Code'
};

const CHAT_EDITOR_IMPROVE_CODE: Command = {
    id: 'theia-ai:chat:editor:improve-code',
    label: 'Improve this Code'
};

@injectable()
export class AIChatCommandContribution implements CommandContribution, MenuContribution {

    @inject(MessageService)
    private readonly messageService: MessageService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(COMMAND_CHAT_RESPONSE_COMMAND, {
            execute: async (arg: AIChatCommandArguments) => {
                if (arg.handler) {
                    arg.handler();
                } else {
                    console.error(`No handle available which is necessary when using the default command '${COMMAND_CHAT_RESPONSE_COMMAND.id}'.`);
                }
            }
        });
        commands.registerCommand(COMMAND_DEMO_SAY_HELLO, {
            execute: async (arg: string) => {
                this.messageService.info(`Hello ${arg}!`);
            }
        });
        commands.registerCommand(CHAT_EDITOR_START, {
            isVisible: (widget?: unknown) => this.isInEditorWidgetWithNonEmptySelection(widget),
            isEnabled: (widget?: unknown) => this.isInEditorWidgetWithNonEmptySelection(widget),
            execute: (widget: EditorWidget) => this.startChat(widget)
        });
        // TODO JF
        commands.registerCommand(CHAT_EDITOR_EXPLAIN_CODE, {
            isVisible: (widget?: unknown) => this.isInEditorWidgetWithNonEmptySelection(widget),
            isEnabled: (widget?: unknown) => this.isInEditorWidgetWithNonEmptySelection(widget),
            execute: (widget: EditorWidget) => { }
        });
        // TODO JF
        commands.registerCommand(CHAT_EDITOR_IMPROVE_CODE, {
            isVisible: (widget?: unknown) => this.isInEditorWidgetWithNonEmptySelection(widget),
            isEnabled: (widget?: unknown) => this.isInEditorWidgetWithNonEmptySelection(widget),
            execute: (widget: EditorWidget) => { }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.COMMANDS, {
            commandId: CHAT_EDITOR_START.id,
            order: 'a'
        });
        menus.registerMenuAction(EditorContextMenu.COMMANDS, {
            commandId: CHAT_EDITOR_EXPLAIN_CODE.id,
            order: 'b'
        });
        menus.registerMenuAction(EditorContextMenu.COMMANDS, {
            commandId: CHAT_EDITOR_IMPROVE_CODE.id,
            order: 'c'
        });
    }

    protected isInEditorWidgetWithNonEmptySelection(widget?: unknown): boolean {
        if (widget === undefined) {
            return false;
        }
        if (widget instanceof EditorWidget) {
            const selectedText = widget.editor.document.getText(widget.editor.selection);
            return selectedText.trim().length > 0;
        }
        return false;
    }

    protected startChat(widget: EditorWidget): void {
        const selectedText = widget.editor.document.getText(widget.editor.selection);
        console.log(selectedText);
    }
}
