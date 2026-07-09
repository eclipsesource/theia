// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import * as React from '@theia/core/shared/react';
import { CommandService, nls } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { codicon, CommonCommands, ReactWidget } from '@theia/core/lib/browser';
import { AiConfigurationScope } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';

export type AiConfigurationViewMode = 'simple' | 'pro';

/**
 * Title bar of the AI Configuration view: title, scope tabs, Simple/Pro toggle,
 * and the "Open Settings UI" gear. Scope tabs and the mode toggle are render-only
 * in this iteration (their behaviour is deferred to later tickets).
 */
@injectable()
export class AiConfigurationTitleBarWidget extends ReactWidget {

    static readonly ID = 'ai-configuration-title-bar';

    @inject(CommandService)
    protected readonly commandService: CommandService;

    protected scope: AiConfigurationScope = 'user';
    protected mode: AiConfigurationViewMode = 'pro';

    protected static readonly SCOPES: readonly AiConfigurationScope[] = ['user', 'workspace', 'folder'];

    @postConstruct()
    protected init(): void {
        this.id = AiConfigurationTitleBarWidget.ID;
        this.addClass('ai-configuration-title-bar');
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='ai-configuration-title-bar-content'>
            <div className='ai-configuration-title-bar-heading'>
                <span className={codicon('hubot')}></span>
                <span className='ai-configuration-title-bar-label'>
                    {nls.localize('theia/ai/core/aiConfiguration/label', 'AI Configuration')}
                </span>
            </div>
            <div className='ai-configuration-title-bar-controls'>
                {this.renderScopeTabs()}
                {this.renderModeToggle()}
                <button
                    className='ai-configuration-title-bar-gear'
                    title={nls.localizeByDefault('Open Settings (UI)')}
                    onClick={this.openSettings}
                >
                    <span className={codicon('settings-gear')}></span>
                </button>
            </div>
        </div>;
    }

    protected renderScopeTabs(): React.ReactNode {
        const labels: Record<AiConfigurationScope, string> = {
            user: nls.localizeByDefault('User'),
            workspace: nls.localizeByDefault('Workspace'),
            folder: nls.localizeByDefault('Folder')
        };
        return <div className='ai-configuration-scope-tabs'>
            {AiConfigurationTitleBarWidget.SCOPES.map(scope =>
                <button
                    key={scope}
                    data-scope={scope}
                    className={`ai-configuration-scope-tab${scope === this.scope ? ' selected' : ''}`}
                    onClick={this.onScopeClick}
                >{labels[scope]}</button>
            )}
        </div>;
    }

    protected renderModeToggle(): React.ReactNode {
        return <div className='ai-configuration-mode-toggle'>
            <button
                data-mode='simple'
                className={`ai-configuration-mode-button${this.mode === 'simple' ? ' selected' : ''}`}
                onClick={this.onModeClick}
            >{nls.localize('theia/ai/core/aiConfiguration/modeSimple', 'Simple')}</button>
            <button
                data-mode='pro'
                className={`ai-configuration-mode-button${this.mode === 'pro' ? ' selected' : ''}`}
                onClick={this.onModeClick}
            >{nls.localize('theia/ai/core/aiConfiguration/modePro', 'Pro')}</button>
        </div>;
    }

    protected onScopeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        const scope = event.currentTarget.getAttribute('data-scope') as AiConfigurationScope | null;
        if (scope && scope !== this.scope) {
            this.scope = scope;
            this.update();
        }
    };

    protected onModeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        const mode = event.currentTarget.getAttribute('data-mode') as AiConfigurationViewMode | null;
        if (mode && mode !== this.mode) {
            this.mode = mode;
            this.update();
        }
    };

    protected openSettings = () => {
        this.commandService.executeCommand(CommonCommands.OPEN_PREFERENCES.id);
    };
}
