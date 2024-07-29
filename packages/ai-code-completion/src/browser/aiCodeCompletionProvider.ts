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

import { CompletionItemProvider, CompletionItem, TextDocument, Position, CancellationToken, ProviderResult, CompletionContext } from 'vscode';
import { CodeCompletionAgent } from './codeCompletionAgent';
import { inject } from '@theia/core/shared/inversify';

export class AICodeCompletionProvider implements CompletionItemProvider {

    @inject(CodeCompletionAgent)
    private agent: CodeCompletionAgent;

    constructor() { }

    provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<CompletionItem[]> {
        const text = document.getText();
        const completions = this.agent.getCompletions(text, position);
        return completions.map(completion => new CompletionItem(completion));
    }

    resolveCompletionItem(item: CompletionItem, token: CancellationToken): ProviderResult<CompletionItem> {
        return item;
    }
}
