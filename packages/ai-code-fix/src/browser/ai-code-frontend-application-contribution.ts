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
import { inject, injectable } from '@theia/core/shared/inversify';
import { AICodeFixProvider } from './ai-code-fix-provider';
import { AICodeFixPrefs } from './ai-code-fix-preference';

@injectable()
export class AIFrontendApplicationContribution implements FrontendApplicationContribution {
    @inject(AICodeFixProvider)
    private codeFixProvider: AICodeFixProvider;

    @inject(PreferenceService)
    private readonly preferenceService: PreferenceService;

    private disposable: monaco.IDisposable | undefined;

    onDidInitializeLayout(): void {
        const enableCodeCompletion = this.preferenceService.get<boolean>(AICodeFixPrefs.ENABLED, false);
        if (enableCodeCompletion) {
            this.disposable = monaco.languages.registerCodeActionProvider({ scheme: 'file' }, (this.codeFixProvider as monaco.languages.CodeActionProvider));
        }
        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === AICodeFixPrefs.ENABLED) {
                if (this.disposable) {
                    this.disposable.dispose();
                    this.disposable = undefined;
                }
                if (event.newValue) {
                    this.disposable = monaco.languages.registerCodeActionProvider({ scheme: 'file' }, (this.codeFixProvider as monaco.languages.CodeActionProvider));
                }
            }
        });
    }

    onStop(): void {
    }
}
