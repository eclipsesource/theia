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

@injectable()
export class CodePartRenderer
    implements ChatResponsePartRenderer<CodeChatResponseContent> {

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    canHandle(response: ChatResponseContent): number {
        if (isCodeChatResponseContent(response)) {
            return 10;
        }
        return -1;
    }
    render(response: CodeChatResponseContent): ReactNode {
        // FIXME do not hard code the language
        const highlightedCode = hljs.highlight(response.code, { language: 'typescript' }).value;

        const title = response.location?.uri?.toString() ?? 'Generated Code';
        return (
            <div>
                <div className="top">
                    <div className="left">{title}</div>
                    <div className="right">
                        <button onClick={this.writeCodeToClipboard.bind(this, response.code)}>Copy</button>
                        <button>Insert at Cursor</button>
                    </div>
                </div>
                <pre>
                    <code dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedCode) }}></code>
                </pre>
            </div>
        );
    }

    private writeCodeToClipboard(code: string): void {
        this.clipboardService.writeText(code);
    }
}
