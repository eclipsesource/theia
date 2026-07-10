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

import { ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import {
    DEFAULT_TOOL_CONFIRMATION_PREFERENCE,
    TOOL_CONFIRMATION_PREFERENCE,
    ToolConfirmationMode
} from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ShellCommandPermissionService } from '@theia/ai-terminal/lib/browser/shell-command-permission-service';
import { SHELL_COMMAND_ALLOWLIST_PREFERENCE, SHELL_COMMAND_DENYLIST_PREFERENCE } from '@theia/ai-terminal/lib/common/shell-command-preferences';
import { Emitter, Event, nls } from '@theia/core';
import { AiConfigurationService } from '@theia/ai-core/lib/common/ai-configuration-service';
import { codicon, ConfirmDialog } from '@theia/core/lib/browser';
import { DisposableCollection, PreferenceScope } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationRenderContext,
    AiConfigurationScope,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';
import { AiConfigurationSection } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-section';
import { AiEnumSelect } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';

const TOOL_OPTIONS: { value: ToolConfirmationMode; label: string }[] = [
    { value: ToolConfirmationMode.DISABLED, label: nls.localizeByDefault('Disabled') },
    { value: ToolConfirmationMode.CONFIRM, label: nls.localize('theia/ai/ide/toolsConfiguration/toolOptions/confirm/label', 'Confirm') },
    { value: ToolConfirmationMode.ALWAYS_ALLOW, label: nls.localizeByDefault('Always Allow') }
];

/**
 * The Tools category: a `single-page` category with the default confirmation mode, a per-tool
 * confirmation table, the recommended-defaults banner, and the shell allow/deny-list editors.
 */
@injectable()
export class ToolsConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.TOOLS;
    readonly label = nls.localizeByDefault('Tools');
    readonly iconClass = codicon('tools');
    readonly order = AiConfigurationCategoryOrder.TOOLS;
    readonly kind = 'single-page' as const;

    @inject(ToolConfirmationManager)
    protected readonly confirmationManager: ToolConfirmationManager;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    @inject(ShellCommandPermissionService)
    protected readonly shellCommandPermissionService: ShellCommandPermissionService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected toolNames: string[] = [];
    protected toolConfirmationModes: Record<string, ToolConfirmationMode> = {};
    protected defaultState: ToolConfirmationMode = ToolConfirmationMode.CONFIRM;
    protected allowlistPatterns: string[] = [];
    protected denylistPatterns: string[] = [];

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    @postConstruct()
    protected init(): void {
        this.load();
        this.toDispose.pushAll([
            this.toolInvocationRegistry.onDidChange(() => {
                this.loadTools();
                this.onDidChangeEmitter.fire();
            }),
            this.aiConfigurationService.onDidChange(async change => {
                let changed = false;
                if (change.affectsPreference(TOOL_CONFIRMATION_PREFERENCE) || change.affectsPreference(DEFAULT_TOOL_CONFIRMATION_PREFERENCE)) {
                    await this.loadConfirmation();
                    changed = true;
                }
                if (change.affectsPreference(SHELL_COMMAND_ALLOWLIST_PREFERENCE) || change.affectsPreference(SHELL_COMMAND_DENYLIST_PREFERENCE)) {
                    this.loadShellPatterns();
                    changed = true;
                }
                if (changed) {
                    this.onDidChangeEmitter.fire();
                }
            })
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async load(): Promise<void> {
        this.loadTools();
        await this.loadConfirmation();
        this.loadShellPatterns();
        this.onDidChangeEmitter.fire();
    }

    protected loadTools(): void {
        this.toolNames = this.toolInvocationRegistry.getAllFunctions()
            .map(func => func.name)
            .sort((a, b) => {
                const aIsMcp = a.startsWith('mcp_');
                const bIsMcp = b.startsWith('mcp_');
                if (aIsMcp !== bIsMcp) {
                    return aIsMcp ? 1 : -1;
                }
                return a.localeCompare(b);
            });
    }

    protected async loadConfirmation(): Promise<void> {
        this.defaultState = this.confirmationManager.getDefaultConfirmationMode();
        this.toolConfirmationModes = this.confirmationManager.getAllConfirmationSettings();
    }

    protected loadShellPatterns(): void {
        this.allowlistPatterns = this.shellCommandPermissionService.getAllowlistPatterns();
        this.denylistPatterns = this.shellCommandPermissionService.getDenylistPatterns();
    }

    protected getEffectiveState(toolName: string): ToolConfirmationMode {
        const explicit = this.toolConfirmationModes[toolName];
        if (explicit !== undefined) {
            return explicit;
        }
        const toolRequest = this.toolInvocationRegistry.getFunction(toolName);
        if (toolRequest?.confirmAlwaysAllow && this.defaultState === ToolConfirmationMode.ALWAYS_ALLOW) {
            return ToolConfirmationMode.CONFIRM;
        }
        return this.defaultState;
    }

    /**
     * Refreshes the cached view-model from the active scope before each render, so switching the scope
     * tab shows the values effective at that scope and writes target it.
     */
    override renderPage(ctx: AiConfigurationRenderContext): React.ReactNode {
        const scope = AiConfigurationScope.toPreferenceScope(ctx.scope);
        this.defaultState = this.confirmationManager.getDefaultConfirmationMode(scope, ctx.resourceUri);
        this.toolConfirmationModes = this.confirmationManager.getAllConfirmationSettings(scope, ctx.resourceUri);
        this.allowlistPatterns = this.shellCommandPermissionService.getAllowlistPatterns(scope, ctx.resourceUri);
        this.denylistPatterns = this.shellCommandPermissionService.getDenylistPatterns(scope, ctx.resourceUri);
        return super.renderPage(ctx);
    }

    protected override renderHeader(ctx: AiConfigurationRenderContext): React.ReactNode {
        const scope = AiConfigurationScope.toPreferenceScope(ctx.scope);
        return <div className='ai-configuration-page'>
            <div className='ai-tools-configuration-header'>
                <div className='ai-tools-configuration-default-label'>
                    {nls.localize('theia/ai/ide/toolsConfiguration/default/label', 'Default Tool Confirmation Mode:')}
                </div>
                <AiEnumSelect
                    ariaLabel={nls.localize('theia/ai/ide/toolsConfiguration/default/label', 'Default Tool Confirmation Mode:')}
                    value={this.defaultState}
                    options={TOOL_OPTIONS}
                    onCommit={value => this.confirmationManager.setDefaultConfirmationMode(value as ToolConfirmationMode, scope, ctx.resourceUri)}
                />
                <button
                    className='theia-button secondary ai-tools-reset-button'
                    title={nls.localize('theia/ai/ide/toolsConfiguration/resetAllTooltip', 'Reset all tools to default')}
                    onClick={() => this.resetAllToolsToDefault(scope, ctx.resourceUri)}
                >
                    {nls.localize('theia/ai/ide/toolsConfiguration/resetAll', 'Reset All')}
                </button>
            </div>
            {this.renderRecommendedDefaultsBanner(ctx)}
        </div>;
    }

    protected renderRecommendedDefaultsBanner(ctx: AiConfigurationRenderContext): React.ReactNode {
        if (this.defaultState !== ToolConfirmationMode.CONFIRM) {
            return undefined;
        }
        return <div className='ai-tools-recommended-defaults-banner'>
            <span className='ai-tools-recommended-defaults-text'>
                {nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/message',
                    'Tool calls currently require approval. Auto-allow all built-in tools at once.'
                    + ' Tools that require extra confirmation (e.g. shell execution), MCP tools,'
                    + ' and any tools added later will still ask before running.')}
            </span>
            <button className='theia-button main' onClick={() => this.allowCurrentTools(ctx)}>
                {nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/apply', 'Allow Default Tools')}
            </button>
        </div>;
    }

    protected renderSections(ctx: AiConfigurationRenderContext): React.ReactNode {
        const scope = AiConfigurationScope.toPreferenceScope(ctx.scope);
        return <div className='ai-configuration-page'>
            <table className='ai-configuration-table'>
                <thead>
                    <tr>
                        <th className='tool-name-column'>{nls.localizeByDefault('Tool')}</th>
                        <th className='confirmation-mode-column'>{nls.localize('theia/ai/ide/toolsConfiguration/confirmationMode/label', 'Confirmation Mode')}</th>
                    </tr>
                </thead>
                <tbody>
                    {this.toolNames.map(name => {
                        const effective = this.getEffectiveState(name);
                        return <tr key={name} className={effective === this.defaultState ? 'default-mode' : 'custom-mode'}>
                            <td className='tool-name-column'>{name}</td>
                            <td className='confirmation-mode-column'>
                                <AiEnumSelect
                                    ariaLabel={nls.localize('theia/ai/ide/toolsConfiguration/confirmationMode/label', 'Confirmation Mode')}
                                    value={effective}
                                    options={TOOL_OPTIONS}
                                    onCommit={value => this.handleToolConfirmationModeChange(name, value as ToolConfirmationMode, scope, ctx.resourceUri)}
                                />
                            </td>
                        </tr>;
                    })}
                </tbody>
            </table>
            <AiConfigurationSection title={nls.localize('theia/ai/ide/toolsConfiguration/shellAllowlist/title', 'Shell Execute Allowlist')}>
                <ShellPatternListEditor
                    description={nls.localize('theia/ai/ide/toolsConfiguration/shellAllowlist/description',
                        'Commands matching these patterns will be automatically allowed without confirmation. '
                        + 'Use * as wildcard: "git log" (exact match), "git log *" (with any arguments). Wildcard must be preceded by a space.')}
                    placeholder={nls.localize('theia/ai/ide/shellAllowlist/placeholder', 'e.g., "git log" (exact) or "git log *" (with args)')}
                    emptyMessage={nls.localize('theia/ai/ide/toolsConfiguration/shellAllowlist/empty', 'No patterns configured. All shell commands will require confirmation.')}
                    patterns={this.allowlistPatterns}
                    onAdd={pattern => this.shellCommandPermissionService.addAllowlistPatterns([pattern], scope, ctx.resourceUri)}
                    onRemove={pattern => this.shellCommandPermissionService.removeAllowlistPattern(pattern, scope, ctx.resourceUri)}
                />
            </AiConfigurationSection>
            <AiConfigurationSection title={nls.localize('theia/ai/ide/toolsConfiguration/shellDenylist/title', 'Shell Execute Denylist')}>
                <ShellPatternListEditor
                    description={nls.localize('theia/ai/ide/toolsConfiguration/shellDenylist/description',
                        'Commands matching these patterns will be automatically denied without confirmation. '
                        + "Use this to block dangerous commands like 'git push *' or 'rm -rf /'.")}
                    placeholder={nls.localize('theia/ai/ide/shellDenylist/placeholder', 'e.g., "git push *" or "rm -rf /"')}
                    emptyMessage={nls.localize('theia/ai/ide/toolsConfiguration/shellDenylist/empty', 'No patterns configured. No shell commands will be automatically denied.')}
                    patterns={this.denylistPatterns}
                    onAdd={pattern => this.shellCommandPermissionService.addDenylistPatterns([pattern], scope, ctx.resourceUri)}
                    onRemove={pattern => this.shellCommandPermissionService.removeDenylistPattern(pattern, scope, ctx.resourceUri)}
                />
            </AiConfigurationSection>
        </div>;
    }

    protected async handleToolConfirmationModeChange(toolName: string, mode: ToolConfirmationMode, scope: PreferenceScope, resourceUri?: string): Promise<void> {
        const toolRequest = this.toolInvocationRegistry.getFunction(toolName);
        if (mode === ToolConfirmationMode.ALWAYS_ALLOW && toolRequest?.confirmAlwaysAllow) {
            const confirmed = await this.showConfirmAlwaysAllowDialog(toolName, toolRequest);
            if (!confirmed) {
                this.onDidChangeEmitter.fire();
                return;
            }
        }
        await this.confirmationManager.setConfirmationMode(toolName, mode, toolRequest, scope, resourceUri);
    }

    protected async showConfirmAlwaysAllowDialog(toolName: string, toolRequest: ToolRequest): Promise<boolean> {
        const warningMessage = typeof toolRequest.confirmAlwaysAllow === 'string'
            ? toolRequest.confirmAlwaysAllow
            : nls.localize('theia/ai/ide/toolsConfiguration/confirmAlwaysAllow/genericWarning',
                'This tool requires confirmation before auto-approval can be enabled. '
                + 'Once enabled, all future invocations will execute without confirmation. '
                + 'Only enable this if you trust this tool and understand the potential risks.');
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/ide/toolsConfiguration/confirmAlwaysAllow/title', 'Enable Auto-Approval for "{0}"?', toolName),
            msg: warningMessage,
            ok: nls.localize('theia/ai/ide/toolsConfiguration/confirmAlwaysAllow/confirm', 'I understand, enable auto-approval'),
            cancel: nls.localizeByDefault('Cancel')
        });
        return !!await dialog.open();
    }

    protected async resetAllToolsToDefault(scope: PreferenceScope, resourceUri?: string): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/ide/toolsConfiguration/resetAllConfirmDialog/title', 'Reset All Tool Confirmation Modes'),
            msg: nls.localize('theia/ai/ide/toolsConfiguration/resetAllConfirmDialog/msg',
                'Are you sure you want to reset all tool confirmation modes to the default? This will remove all custom settings.'),
            ok: nls.localize('theia/ai/ide/toolsConfiguration/resetAll', 'Reset All'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            await this.confirmationManager.resetAllConfirmationModeSettings(scope, resourceUri);
        }
    }

    protected async allowCurrentTools(ctx: AiConfigurationRenderContext): Promise<void> {
        const scope = AiConfigurationScope.toPreferenceScope(ctx.scope);
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/dialogTitle', 'Allow Default Tools?'),
            msg: this.buildAllowCurrentToolsMessage(),
            ok: nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/dialogConfirm', 'I understand, allow'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (!await dialog.open()) {
            return;
        }
        const updates: Array<{ toolId: string; mode: ToolConfirmationMode; toolRequest: ToolRequest }> = [];
        for (const tool of this.toolInvocationRegistry.getAllFunctions()) {
            if (tool.confirmAlwaysAllow || tool.name.startsWith('mcp_') || this.toolConfirmationModes[tool.name] === ToolConfirmationMode.DISABLED) {
                continue;
            }
            updates.push({ toolId: tool.name, mode: ToolConfirmationMode.ALWAYS_ALLOW, toolRequest: tool });
        }
        await this.confirmationManager.setConfirmationModes(updates, scope, ctx.resourceUri);
    }

    protected buildAllowCurrentToolsMessage(): HTMLElement {
        const container = document.createElement('div');
        const lines = [
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line1', 'This sets all currently registered built-in tools to "Always Allow".'),
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line2',
                'Tools that require extra confirmation (such as shell execution) will still ask before running.'),
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line3',
                'MCP tools are third-party and are not included. You can allow them individually in this view.'),
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line4', 'Tools added later will still default to "Confirm" so you can review them.'),
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line5', 'You can change this later in this view.')
        ];
        for (const line of lines) {
            const paragraph = document.createElement('p');
            paragraph.textContent = line;
            container.appendChild(paragraph);
        }
        return container;
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const toolTypeLabel = nls.localizeByDefault('Tool');
        const items: AiConfigurationSearchItem[] = [{
            label: nls.localize('theia/ai/ide/toolsConfiguration/default/label', 'Default Tool Confirmation Mode:'),
            typeLabel: nls.localizeByDefault('Setting'),
            categoryId: this.id,
            target: { categoryId: this.id },
            keywords: `${DEFAULT_TOOL_CONFIRMATION_PREFERENCE} ${TOOL_CONFIRMATION_PREFERENCE} ${SHELL_COMMAND_ALLOWLIST_PREFERENCE} ${SHELL_COMMAND_DENYLIST_PREFERENCE}`
        }];
        for (const name of this.toolNames) {
            items.push({ label: name, typeLabel: toolTypeLabel, categoryId: this.id, target: { categoryId: this.id }, keywords: name });
        }
        return items;
    }
}

/** Add/remove editor over a shell command pattern list, owning its own input and validation state. */
const ShellPatternListEditor: React.FC<{
    description: string;
    placeholder: string;
    emptyMessage: string;
    patterns: string[];
    onAdd(pattern: string): void;
    onRemove(pattern: string): void;
}> = ({ description, placeholder, emptyMessage, patterns, onAdd, onRemove }) => {
    const [draft, setDraft] = React.useState('');
    const [error, setError] = React.useState<string | undefined>(undefined);
    const add = (): void => {
        const trimmed = draft.trim();
        if (trimmed.length === 0) {
            return;
        }
        try {
            onAdd(trimmed);
            setDraft('');
            setError(undefined);
        } catch (addError) {
            setError(addError instanceof Error ? addError.message : String(addError));
        }
    };
    return <div className='ai-shell-permission-list-section'>
        <p className='ai-shell-permission-list-description'>{description}</p>
        <div className='ai-shell-permission-list-input-row'>
            <input
                type='text'
                className='theia-input'
                placeholder={placeholder}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { add(); } }}
            />
            <button className='theia-button main' onClick={add}>{nls.localizeByDefault('Add')}</button>
        </div>
        {error && <p className='ai-shell-permission-list-error'>{error}</p>}
        <ul className='ai-shell-permission-list-patterns'>
            {[...patterns].sort((a, b) => a.localeCompare(b)).map(pattern => <li key={pattern} className='ai-shell-permission-list-pattern-item'>
                <code>{pattern}</code>
                <button className='theia-button secondary' onClick={() => onRemove(pattern)}>{nls.localizeByDefault('Remove')}</button>
            </li>)}
        </ul>
        {patterns.length === 0 && <p className='ai-shell-permission-list-empty'>{emptyMessage}</p>}
    </div>;
};
