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

import { ChatResponsePartRenderer } from '../types';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ChatResponseContent,
    isCodeChatResponseContent,
    CodeChatResponseContent,
} from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import * as DOMPurify from '@theia/core/shared/dompurify';
import { EditorManager } from '@theia/editor/lib/browser';
import { URI } from '@theia/core';

@injectable()
export class CodePartRenderer
    implements ChatResponsePartRenderer<CodeChatResponseContent> {

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    canHandle(response: ChatResponseContent): number {
        if (isCodeChatResponseContent(response)) {
            return 10;
        }
        return -1;
    }
    render(response: CodeChatResponseContent): ReactNode {
        // FIXME do not hard code the language
        const highlightedCode = hljs.highlight(response.code, { language: 'typescript' }).value;

        const title = this.getTitle(response.location?.uri);

        return (
            <div className="theia-CodePartRenderer-root">
                <div className="theia-CodePartRenderer-top">
                    <div className="theia-CodePartRenderer-left">{title}</div>
                    <div className="theia-CodePartRenderer-right">
                        <button onClick={this.writeCodeToClipboard.bind(this, response.code)}>Copy</button>
                        <button onClick={this.insertCode.bind(this, response.code)}>Insert at Cursor</button>
                    </div>
                </div>
                <div className="theia-CodePartRenderer-separator"></div>
                <div className="theia-CodePartRenderer-bottom">
                    <pre>
                        <code dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedCode) }}></code>
                    </pre>
                </div>
            </div>
        );
    }

    private getTitle(uri: URI | undefined): string {
        return uri?.path?.toString().split('/').pop() ?? 'Generated Code';
    }

    private writeCodeToClipboard(code: string): void {
        this.clipboardService.writeText(code);
    }

    protected insertCode(code: string): void {
        const editor = this.editorManager.currentEditor;
        if (editor) {
            const currentEditor = editor.editor;
            const selection = currentEditor.selection;

            // Insert the text at the current cursor position
            // If there is a selection, replace the selection with the text
            currentEditor.executeEdits([{
                range: {
                    start: selection.start,
                    end: selection.end
                },
                newText: code
            }]);
        }
    }
}
