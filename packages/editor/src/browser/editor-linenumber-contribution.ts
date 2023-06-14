// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { EditorManager } from './editor-manager';
import { EditorMouseEvent, MouseTargetType, TextEditor } from './editor';
import { injectable, inject, optional } from '@theia/core/shared/inversify';
import {
    FrontendApplicationContribution,
    QuickInputService, ApplicationShell, ContextMenuRenderer
} from '@theia/core/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DisposableCollection, MenuPath } from '@theia/core';
import { EditorWidget } from './editor-widget';

export const EDITOR_LINENUMBER_CONTEXT_MENU: MenuPath = ['editor_linenumber_context_menu'];

@injectable()
export class EditorLineNumberContribution implements FrontendApplicationContribution {

    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;

    onStart(): void {
        this.editorManager.onCreated(editor => this.addLineNumberContextMenu(editor));
    }

    protected readonly toDisposeOnClosedEditor = new DisposableCollection();

    protected addLineNumberContextMenu(editorWidget: EditorWidget): void {
        const editor = editorWidget.editor;

        if (editor) {
            this.toDisposeOnClosedEditor.push(
                editor.onMouseDown(event => this.handleContextMenu(editor, event))
            );

            editorWidget.onDispose(() => this.toDisposeOnClosedEditor.dispose());
        }
    }

    protected handleContextMenu(editor: TextEditor, event: EditorMouseEvent): void {
        if (event.target && event.target.type === MouseTargetType.GUTTER_LINE_NUMBERS) {
            if (event.event.button === 2) {
                editor.focus();
                const contextKeyService = this.contextKeyService.createOverlay([['editorLineNumber', event.target.position?.line]]);
                const uri = editor.getResourceUri()!;
                const args = [{
                    lineNumber: event.target.position?.line!,
                    uri: uri['codeUri']
                }];

                setTimeout(() => {
                    this.contextMenuRenderer.render({
                        menuPath: EDITOR_LINENUMBER_CONTEXT_MENU,
                        anchor: event.event,
                        args,
                        contextKeyService,
                        onHide: () => contextKeyService.dispose()
                    });
                });
            }
        }
    }

}
