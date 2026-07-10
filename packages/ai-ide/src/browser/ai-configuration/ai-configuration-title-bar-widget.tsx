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
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferencesCommands } from '@theia/preferences/lib/browser/util/preference-types';
import { AiConfigurationScope } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationScopeService } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-scope-service';

export type AiConfigurationViewMode = 'simple' | 'pro';

/**
 * Title bar of the AI Configuration view: title, scope tabs, Simple/Pro toggle,
 * and the "Open Settings UI" gear. The scope tabs drive the view's active scope (via
 * {@link AiConfigurationScopeService}); the Folder tab is shown only when a folder scope applies,
 * mirroring the Settings UI. The Simple/Pro toggle is render-only for now (behaviour is deferred).
 */
@injectable()
export class AiConfigurationTitleBarWidget extends ReactWidget {

    static readonly ID = 'ai-configuration-title-bar';

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(AiConfigurationScopeService)
    protected readonly scopeService: AiConfigurationScopeService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected mode: AiConfigurationViewMode = 'pro';

    @postConstruct()
    protected init(): void {
        this.id = AiConfigurationTitleBarWidget.ID;
        this.addClass('ai-configuration-title-bar');
        this.toDispose.push(this.scopeService.onDidChangeScope(() => this.update()));
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => this.onWorkspaceChanged()));
        this.toDispose.push(this.workspaceService.onWorkspaceLocationChanged(() => this.onWorkspaceChanged()));
        // Re-render once the workspace has resolved, so the Workspace/Folder tabs appear even when this
        // widget is constructed before the workspace service is ready.
        this.workspaceService.ready.then(() => this.onWorkspaceChanged());
        this.update();
    }

    /** The scopes selectable in the current workspace, in tab order. */
    protected availableScopes(): AiConfigurationScope[] {
        const scopes: AiConfigurationScope[] = ['user'];
        if (this.workspaceService.workspace) {
            scopes.push('workspace');
        }
        const roots = this.workspaceService.tryGetRoots();
        // A single-folder workspace has no distinct folder scope (it coincides with the workspace scope),
        // so only offer Folder for multi-root or saved workspaces, matching the Settings UI's folder tab.
        if (roots.length > 0 && (roots.length > 1 || this.workspaceService.saved)) {
            scopes.push('folder');
        }
        return scopes;
    }

    /** Resource uri of the active folder for `folder` scope; the first workspace root. */
    protected folderUri(): string | undefined {
        return this.workspaceService.tryGetRoots()[0]?.resource.toString();
    }

    protected onWorkspaceChanged(): void {
        // Fall back to User if the active scope is no longer applicable (e.g. the workspace was closed).
        if (!this.availableScopes().includes(this.scopeService.getScope())) {
            this.scopeService.setScope('user');
        }
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
        const active = this.scopeService.getScope();
        return <div className='ai-configuration-scope-tabs'>
            {this.availableScopes().map(scope =>
                <button
                    key={scope}
                    data-scope={scope}
                    className={`ai-configuration-scope-tab${scope === active ? ' selected' : ''}`}
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
        if (scope) {
            this.scopeService.setScope(scope, scope === 'folder' ? this.folderUri() : undefined);
        }
    };

    protected onModeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        const mode = event.currentTarget.getAttribute('data-mode') as AiConfigurationViewMode | null;
        if (mode && mode !== this.mode) {
            this.mode = mode;
            this.update();
        }
    };

    /** Opens the Settings UI at the view's active scope, mirroring the scope selected here. */
    protected openSettings = () => {
        switch (this.scopeService.getScope()) {
            case 'workspace':
                this.commandService.executeCommand(PreferencesCommands.OPEN_WORKSPACE_PREFERENCES.id);
                break;
            case 'folder':
                this.commandService.executeCommand(PreferencesCommands.OPEN_FOLDER_PREFERENCES.id);
                break;
            case 'user':
            default:
                this.commandService.executeCommand(CommonCommands.OPEN_PREFERENCES.id);
                break;
        }
    };
}
