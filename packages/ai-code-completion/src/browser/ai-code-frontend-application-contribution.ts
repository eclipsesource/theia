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

import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { AICodeCompletionProvider } from './ai-code-completion-provider';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AIActivationService } from '@theia/ai-core/lib/browser';

@injectable()
export class AIFrontendApplicationContribution implements FrontendApplicationContribution {
    @inject(AICodeCompletionProvider)
    protected codeCompletionProvider: AICodeCompletionProvider;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    private disposable: monaco.IDisposable | undefined;

    protected get isCodeCompletionEnabled(): boolean {
        return this.preferenceService.get<boolean>('ai-code-completion.enable', false);
    }

    onDidInitializeLayout(): void {
        if (this.isCodeCompletionEnabled && this.activationService.isActive) {
            this.disposable = monaco.languages.registerCompletionItemProvider({ scheme: 'file' }, this.codeCompletionProvider);
        }

        this.activationService.onDidChangeActiveStatus(status => {
            this.handlePreferenceChange(this.isCodeCompletionEnabled, status);
        });
        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === 'ai-code-completion.enable') {
                this.handlePreferenceChange(event.newValue, this.activationService.isActive);
            }
        });

    }

    protected handlePreferenceChange(isCodeCompletionEnabled: boolean, isActive: boolean): void {
        if (this.disposable) {
            this.disposable.dispose();
            this.disposable = undefined;
        }
        if (isActive && isCodeCompletionEnabled) {
            this.disposable = monaco.languages.registerCompletionItemProvider({ scheme: 'file' }, this.codeCompletionProvider);
        }
    }

    onStop(): void {
    }
}
