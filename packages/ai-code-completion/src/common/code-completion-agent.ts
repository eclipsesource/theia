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

import * as monaco from '@theia/monaco-editor-core';
import { Agent, LanguageModelSelector, PromptTemplate } from '@theia/ai-core/lib/common';
import { injectable } from '@theia/core/shared/inversify';

export const CodeCompletionAgent = Symbol('CodeCompletionAgent');
export interface CodeCompletionAgent extends Agent {
    provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.CompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.CompletionList | undefined>;
    id: string;
    name: string;
    description: string;
    variables: string[];
    promptTemplates: PromptTemplate[];
    languageModelRequirements: Omit<LanguageModelSelector, 'agentId'>[];
}

@injectable()
export class CodeCompletionAgentImpl implements CodeCompletionAgent {
    async provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position,
        context: monaco.languages.CompletionContext, token: monaco.CancellationToken): Promise<monaco.languages.CompletionList | undefined> {
        return {
            suggestions: [
                {
                    label: 'code-completion-agent',
                    insertText: 'this is my completion',
                    kind: monaco.languages.CompletionItemKind.Text,
                    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
                }
            ]
        };
    }
    id: string = 'code-completion-agent';
    name: string = 'Code Completion Agent';
    description: string = 'This agent provides code completions for a given code snippet.';
    variables: string[] = ['text', 'position'];
    promptTemplates: PromptTemplate[] = [
        {
            id: 'code-completion-prompt',
            template: 'Finish this code {{snippet}}'
        }
    ];
    languageModelRequirements: Omit<LanguageModelSelector, 'agentId'>[] = [{
        purpose: 'code-completion',
        actor: 'code-completion-agent'
    }];
}
