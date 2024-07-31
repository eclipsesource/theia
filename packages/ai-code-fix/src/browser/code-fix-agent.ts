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
import { Agent, getTextOfResponse, LanguageModelRegistry, LanguageModelSelector, PromptService, PromptTemplate } from '@theia/ai-core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ITextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { CodeActionContext } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneLanguages';

export const CodeFixAgent = Symbol('CodeFixAgent');
export interface CodeFixAgent extends Agent {
    provideQuickFix(model: monaco.editor.ITextModel, marker: monaco.editor.IMarkerData,
        context: monaco.languages.CodeActionContext & CodeActionContext, token: monaco.CancellationToken): Promise<monaco.languages.CodeAction[]>;
}

@injectable()
export class CodeFixAgentImpl implements CodeFixAgent {
    variables: string[];

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    async provideQuickFix(model: monaco.editor.ITextModel & ITextModel, marker: monaco.editor.IMarkerData,
        context: monaco.languages.CodeActionContext & CodeActionContext, token: monaco.CancellationToken): Promise<monaco.languages.CodeAction[]> {

        const languageModels = await this.languageModelRegistry.selectLanguageModels({
            agent: 'code-fix-agent',
            purpose: 'code-fix',
            identifier: 'openai/gpt-4o'
        });
        if (languageModels.length === 0) {
            console.error('No language model found for code-fix-agent');
            return [];
        }
        const languageModel = languageModels[0];
        console.log('Code fix agent is using language model:', languageModel.id);

        const fileContent = model.getValue();
        const fileName = model.uri.toString(false);
        const language = model.getLanguageId();
        const errorMsg = marker.message;
        const lineNumber = marker.startLineNumber;
        const editor = monaco.editor.getEditors().find(ed => ed.getModel() === model);
        if (!editor) {
            console.error('No editor found for code-fix-agent');
            return [];
        }

        const prompt = await this.promptService.getPrompt('code-fix-prompt', { fileContent, file: fileName, language, errorMsg: errorMsg, lineNumber: lineNumber });
        if (!prompt) {
            console.error('No prompt found for code-fix-agent');
            return [];
        }
        console.log('Code fix agent is using prompt:', prompt);

        const response = await languageModel.request(({ messages: [{ type: 'text', actor: 'user', query: prompt }] }));
        const fixText = await getTextOfResponse(response);
        console.log('Code fix agent suggests', fixText);

        return [
            {
                title: 'AI QuickFix',
                command: {
                    id: 'ai-code-fix',
                    title: 'AI Code Fix',
                    arguments: [{ model, editor, newText: fixText }]
                },
            }];

    };
    id: string = 'code-fix-agent';
    name: string = 'Code Fix Agent';
    description: string = 'This agent provides fixes for problem markers';
    promptTemplates: PromptTemplate[] = [
        {
            id: 'code-fix-prompt',
            template: `
            You are a code fixing agent. The current file you have to fix is named \${file}.
            The language of the file is \${language}. Return your result as plain text without markdown formatting.
            Provide a corrected version of the following code. 

            \${fileContent}

            The error is reported on line number \${lineNumber} and the error message is \${errorMsg}.
            Provide the full content of the file.
            `,
        }
    ];
    languageModelRequirements: Omit<LanguageModelSelector, 'agent'>[] = [{
        purpose: 'code-fix',
        identifier: 'openai/gpt-4o'
    }];
}
