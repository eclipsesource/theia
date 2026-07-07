// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { PROMPT_VARIABLE } from '@theia/ai-core/lib/browser/prompt-variable-contribution';
import { Emitter, Event, MessageService, nls, PreferenceScope, PreferenceService } from '@theia/core';
import { codicon, ConfirmDialog } from '@theia/core/lib/browser';
import { HoverService } from '@theia/core/lib/browser/hover-service';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationItemStatus,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider,
    AiConfigurationTreeItem
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { CollectionCategoryRenderer, AiConfigurationAddDescriptor } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/collection-category-renderer';
import { MCP_SERVERS_PREF } from '../common/mcp-preferences';
import {
    isLocalMCPServerDescription,
    isRemoteMCPServerDescription,
    MCPFrontendNotificationService,
    MCPFrontendService,
    MCPServerDescription,
    MCPServerStatus
} from '../common/mcp-server-manager';
import { MCPRegistryUiBridge } from './mcp-registry-ui-bridge';
import { MCPServerEditor } from './mcp-server-editor';

/**
 * The MCP Servers category (in `@theia/ai-mcp`): a `collection` porting the MCP server surface
 * onto the shared primitives. Servers are the tree children (status dot from {@link MCPServerStatus});
 * the per-server configuration and tool list are rendered as the item detail.
 */
@injectable()
export class McpServersConfigurationCategory extends CollectionCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.MCP_SERVERS;
    readonly label = nls.localizeByDefault('MCP Servers');
    readonly iconClass = codicon('server-process');
    readonly order = AiConfigurationCategoryOrder.MCP_SERVERS;
    readonly kind = 'collection' as const;

    @inject(MCPFrontendService)
    protected readonly mcpFrontendService: MCPFrontendService;

    @inject(MCPFrontendNotificationService)
    protected readonly mcpFrontendNotificationService: MCPFrontendNotificationService;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(MCPServerEditor)
    protected readonly serverEditor: MCPServerEditor;

    @inject(MCPRegistryUiBridge) @optional()
    protected readonly registryBridge?: MCPRegistryUiBridge;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected servers: MCPServerDescription[] = [];
    protected expandedTools: Record<string, boolean> = {};
    protected oauthCredentialStates: Record<string, boolean> = {};

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.mcpFrontendNotificationService.onDidUpdateMCPServers(() => this.loadServers()));
        this.loadServers();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async loadServers(): Promise<void> {
        const serverNames = (await this.mcpFrontendService.getServerNames()).sort((a, b) => a.localeCompare(b));
        const descriptions = await Promise.all(serverNames.map(name => this.mcpFrontendService.getServerDescription(name)));
        this.servers = descriptions.filter((description): description is MCPServerDescription => description !== undefined);
        this.oauthCredentialStates = Object.fromEntries(await Promise.all(this.servers.map(async server => [
            server.name,
            isRemoteMCPServerDescription(server) && server.oauth
                ? await this.mcpFrontendService.hasStoredOAuthCredentials(server.name)
                : false
        ] as const)));
        this.onDidChangeEmitter.fire();
    }

    protected get categoryId(): string {
        return this.id;
    }

    getTreeChildren(): AiConfigurationTreeItem[] {
        return this.servers.map(server => ({
            id: server.name,
            label: server.name,
            iconClass: this.iconClass,
            description: isLocalMCPServerDescription(server) ? server.command : isRemoteMCPServerDescription(server) ? server.serverUrl : undefined,
            status: this.getServerStatus(server)
        } satisfies AiConfigurationTreeItem));
    }

    protected getServerStatus(server: MCPServerDescription): AiConfigurationItemStatus {
        const status = server.status;
        switch (status) {
            case MCPServerStatus.Running:
            case MCPServerStatus.Connected:
                return { kind: 'on', tooltip: status };
            case MCPServerStatus.Starting:
            case MCPServerStatus.Connecting:
            case MCPServerStatus.AuthenticationRequired:
                return { kind: 'warn', tooltip: status };
            case MCPServerStatus.Errored:
                return { kind: 'error', tooltip: server.error ?? status };
            default:
                return { kind: 'off', tooltip: status };
        }
    }

    protected override renderCategorySettings(): React.ReactNode {
        if (!this.registryBridge) {
            return undefined;
        }
        return <div className='mcp-header-actions'>
            <button
                className='theia-button secondary'
                title={nls.localize('theia/ai/mcpConfiguration/browseAIRegistryTooltip', 'Open the Extensions view to browse AI registry entries')}
                onClick={() => this.registryBridge?.openRegistry()}
            >
                <i className={codicon('link-external')}></i>
                {nls.localize('theia/ai/mcpConfiguration/browseAIRegistry', 'Browse AI registry')}
            </button>
        </div>;
    }

    protected override getAddAction(): AiConfigurationAddDescriptor {
        return {
            label: nls.localizeByDefault('Add MCP Server'),
            iconClass: codicon('add'),
            run: () => { this.serverEditor.openAddServer(); }
        };
    }

    protected override getEmptyMessage(): string {
        return nls.localizeByDefault('No MCP servers configured');
    }

    protected override renderItemHeader(): React.ReactNode {
        // The item sections render the server header (name, status, and lifecycle controls).
        return undefined;
    }

    protected renderItemSections(item: AiConfigurationTreeItem): React.ReactNode {
        const server = this.servers.find(candidate => candidate.name === item.id);
        if (!server) {
            return undefined;
        }
        return <div className='mcp-server-card'>
            {this.renderServerHeader(server)}
            <div className='mcp-server-content'>
                {this.renderCommandSection(server)}
                {this.renderArgumentsSection(server)}
                {this.renderEnvironmentSection(server)}
                {this.renderServerUrlSection(server)}
                {this.renderServerAuthTokenHeaderSection(server)}
                {this.renderServerAuthTokenSection(server)}
                {this.renderServerHeadersSection(server)}
                {this.renderOAuthSection(server)}
                {this.renderAutostartSection(server)}
                {this.renderDeferLoadingSection(server)}
            </div>
            {this.renderToolsSection(server)}
        </div>;
    }

    protected getStatusColor(status?: MCPServerStatus): { bg: string; fg: string } {
        switch (status) {
            case MCPServerStatus.Running:
            case MCPServerStatus.Connected:
                return { bg: 'var(--theia-successBackground)', fg: 'var(--theia-successForeground)' };
            case MCPServerStatus.Starting:
            case MCPServerStatus.Connecting:
            case MCPServerStatus.AuthenticationRequired:
                return { bg: 'var(--theia-warningBackground)', fg: 'var(--theia-warningForeground)' };
            case MCPServerStatus.Errored:
                return { bg: 'var(--theia-errorBackground)', fg: 'var(--theia-errorForeground)' };
            case MCPServerStatus.NotRunning:
            case MCPServerStatus.NotConnected:
                return { bg: 'var(--theia-inputValidation-infoBackground)', fg: 'var(--theia-inputValidation-infoForeground)' };
            default:
                return { bg: 'var(--theia-descriptionForeground)', fg: 'white' };
        }
    }

    protected renderStatusBadge(server: MCPServerDescription): React.ReactNode {
        const colors = this.getStatusColor(server.status);
        const displayStatus = server.status ?? (isRemoteMCPServerDescription(server) ? MCPServerStatus.NotConnected : MCPServerStatus.NotRunning);
        // eslint-disable-next-line no-null/no-null
        const spanRef = React.createRef<HTMLSpanElement>();
        const error = server.error;
        return <div className='mcp-status-container'>
            <span className='mcp-status-badge' style={{ backgroundColor: colors.bg, color: colors.fg }}>{displayStatus}</span>
            {error && <span
                onMouseEnter={() => this.hoverService.requestHover({ content: error, target: spanRef.current!, position: 'left' })}
                onMouseLeave={() => this.hoverService.cancelHover()}
                ref={spanRef}
                className='mcp-error-indicator'
            >?</span>}
        </div>;
    }

    protected renderServerHeader(server: MCPServerDescription): React.ReactNode {
        const isStoppable = server.status === MCPServerStatus.Running
            || server.status === MCPServerStatus.Connected
            || server.status === MCPServerStatus.AuthenticationRequired;
        const isStarting = server.status === MCPServerStatus.Starting || server.status === MCPServerStatus.Connecting;
        const isStartable = server.status === MCPServerStatus.NotRunning
            || server.status === MCPServerStatus.NotConnected
            || server.status === MCPServerStatus.AuthenticationRequired
            || server.status === MCPServerStatus.Errored;
        const isRemote = isRemoteMCPServerDescription(server);
        const isOAuthEnabled = isRemote && !!server.oauth;
        const startIcon = isRemote ? 'plug' : 'play';
        const stopIcon = isRemote ? 'debug-disconnect' : 'debug-stop';
        const startLabel = isRemote ? nls.localizeByDefault('Connect') : nls.localizeByDefault('Start Server');
        const startingLabel = isRemote ? nls.localize('theia/ai/mcpConfiguration/connectingServer', 'Connecting...') : nls.localizeByDefault('Starting...');
        const stopLabel = isRemote ? nls.localizeByDefault('Disconnect') : nls.localizeByDefault('Stop Server');
        return <div className='mcp-server-header'>
            <div className='mcp-server-name'>
                {server.name}
                {this.renderRegistryAffordance(server)}
            </div>
            <div className='mcp-server-header-controls'>
                {this.renderStatusBadge(server)}
                {isStartable && <button className={`mcp-action-button ${codicon(startIcon)}`} onClick={() => this.handleStartServer(server)} title={startLabel} />}
                {isStarting && <button className={`mcp-action-button ${codicon('loading')} theia-animation-spin`} disabled title={startingLabel} />}
                {isStoppable && <button className={`mcp-action-button ${codicon(stopIcon)}`} onClick={() => this.handleStopServer(server.name)} title={stopLabel} />}
                {isOAuthEnabled && isStartable &&
                    <button className={`mcp-action-button ${codicon('sign-in')}`} onClick={() => this.handleSignInServer(server.name)} title={nls.localizeByDefault('Sign In')} />}
                {isOAuthEnabled && this.oauthCredentialStates[server.name] && <button
                    className={`mcp-action-button ${codicon('sign-out')}`}
                    onClick={() => this.handleSignOutServer(server.name)}
                    title={nls.localizeByDefault('Sign Out')}
                />}
                <button
                    className={`mcp-action-button ${codicon('edit')}`}
                    onClick={() => this.serverEditor.openEditServer(server, this.servers.map(candidate => candidate.name))}
                    title={nls.localize('theia/ai/mcpConfiguration/editServer', 'Edit Server')}
                />
                <button
                    className={`mcp-action-button mcp-delete-button ${codicon('trash')}`}
                    onClick={() => this.handleDeleteServer(server.name)}
                    title={nls.localize('theia/ai/mcpConfiguration/deleteServer', 'Delete Server')}
                />
            </div>
        </div>;
    }

    protected renderRegistryAffordance(server: MCPServerDescription): React.ReactNode {
        const registryId = server.registryMetadata?.serverId;
        const bridge = this.registryBridge;
        if (!registryId || !bridge) {
            return undefined;
        }
        return <button
            type='button'
            className='mcp-server-registry-link'
            onClick={() => bridge.openRegistry(registryId)}
            title={nls.localize('theia/ai/mcpConfiguration/openInRegistry', 'Open in AI registry: {0}', registryId)}
        >
            <i className={`${codicon('link-external')} mcp-server-registry-link-icon`} />
            {nls.localize('theia/ai/mcpConfiguration/fromRegistryLink', 'From registry')}
        </button>;
    }

    protected renderCommandSection(server: MCPServerDescription): React.ReactNode {
        if (!isLocalMCPServerDescription(server)) {
            return undefined;
        }
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localizeByDefault('Command')}:</span>
            <code className='mcp-property-value'>{server.command}</code>
        </div>;
    }

    protected renderArgumentsSection(server: MCPServerDescription): React.ReactNode {
        if (!isLocalMCPServerDescription(server) || !server.args || server.args.length === 0) {
            return undefined;
        }
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localizeByDefault('Arguments')}:</span>
            <code className='mcp-property-value'>{server.args.join(' ')}</code>
        </div>;
    }

    protected renderEnvironmentSection(server: MCPServerDescription): React.ReactNode {
        if (!isLocalMCPServerDescription(server) || !server.env || Object.keys(server.env).length === 0) {
            return undefined;
        }
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localize('theia/ai/mcpConfiguration/environmentVariables', 'Environment Variables')}:</span>
            <div className='mcp-property-value'>
                {Object.entries(server.env).map(([key, value]) => <div key={key} className='mcp-env-entry'>
                    <code>{key}={key.toLowerCase().includes('token') ? '******' : String(value)}</code>
                </div>)}
            </div>
        </div>;
    }

    protected renderServerUrlSection(server: MCPServerDescription): React.ReactNode {
        if (!isRemoteMCPServerDescription(server)) {
            return undefined;
        }
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localize('theia/ai/mcpConfiguration/serverUrl', 'Server URL')}:</span>
            <code className='mcp-property-value'>{server.serverUrl}</code>
        </div>;
    }

    protected renderServerAuthTokenHeaderSection(server: MCPServerDescription): React.ReactNode {
        if (!isRemoteMCPServerDescription(server) || !server.serverAuthTokenHeader) {
            return undefined;
        }
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localize('theia/ai/mcpConfiguration/serverAuthTokenHeader', 'Auth Header Name')}:</span>
            <code className='mcp-property-value'>{server.serverAuthTokenHeader}</code>
        </div>;
    }

    protected renderServerAuthTokenSection(server: MCPServerDescription): React.ReactNode {
        if (!isRemoteMCPServerDescription(server) || !server.serverAuthToken) {
            return undefined;
        }
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localize('theia/ai/mcpConfiguration/serverAuthToken', 'Auth Token')}:</span>
            <code className='mcp-property-value'>******</code>
        </div>;
    }

    protected renderServerHeadersSection(server: MCPServerDescription): React.ReactNode {
        if (!isRemoteMCPServerDescription(server) || !server.headers) {
            return undefined;
        }
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localize('theia/ai/mcpConfiguration/headers', 'Headers')}:</span>
            <div className='mcp-property-value'>
                {Object.entries(server.headers).map(([key, value]) => <div key={key} className='mcp-env-entry'>
                    <code>{key}={(key.toLowerCase().includes('token') || key.toLowerCase().includes('authorization')) ? '******' : String(value)}</code>
                </div>)}
            </div>
        </div>;
    }

    protected renderOAuthSection(server: MCPServerDescription): React.ReactNode {
        if (!isRemoteMCPServerDescription(server) || !server.oauth) {
            return undefined;
        }
        const oauth = server.oauth;
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localize('theia/ai/mcpConfiguration/oauth', 'OAuth')}:</span>
            <div className='mcp-property-value'>
                {oauth.clientId && <div className='mcp-env-entry'><code>{nls.localize('theia/ai/mcpConfiguration/oauthClientId', 'OAuth Client ID')}={oauth.clientId}</code></div>}
                {oauth.clientSecret &&
                    <div className='mcp-env-entry'><code>{nls.localize('theia/ai/mcpConfiguration/oauthClientSecret', 'OAuth Client Secret')}=******</code></div>}
                {oauth.scopes && oauth.scopes.length > 0 &&
                    <div className='mcp-env-entry'><code>{nls.localize('theia/ai/mcpConfiguration/oauthScopes', 'OAuth Scopes')}={oauth.scopes.join(' ')}</code></div>}
                {oauth.authorizationServer && <div className='mcp-env-entry'>
                    <code>{nls.localize('theia/ai/mcpConfiguration/oauthAuthorizationServer', 'Authorization Server')}={oauth.authorizationServer}</code>
                </div>}
                {oauth.resource && <div className='mcp-env-entry'><code>{nls.localize('theia/ai/mcpConfiguration/oauthResource', 'OAuth Resource')}={oauth.resource}</code></div>}
            </div>
        </div>;
    }

    protected renderAutostartSection(server: MCPServerDescription): React.ReactNode {
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localize('theia/ai/mcpConfiguration/autostart', 'Autostart')}:</span>
            <span className='mcp-autostart-badge' style={{ color: server.autostart ? 'var(--theia-successForeground)' : 'var(--theia-errorForeground)' }}>
                {server.autostart ? nls.localizeByDefault('Enabled') : nls.localizeByDefault('Disabled')}
            </span>
        </div>;
    }

    protected renderDeferLoadingSection(server: MCPServerDescription): React.ReactNode {
        if (!server.deferLoading) {
            return undefined;
        }
        return <div className='mcp-property-row'>
            <span className='mcp-property-label'>{nls.localize('theia/ai/mcpConfiguration/deferLoading', 'Defer tool loading')}:</span>
            <span className='mcp-autostart-badge' style={{ color: 'var(--theia-successForeground)' }}>{nls.localizeByDefault('Enabled')}</span>
        </div>;
    }

    protected renderToolsSection(server: MCPServerDescription): React.ReactNode {
        if (!server.tools || server.tools.length === 0) {
            return undefined;
        }
        const tools = server.tools;
        const isExpanded = this.expandedTools[server.name] || false;
        return <div className='mcp-tools-section'>
            <div className='mcp-tools-header' onClick={() => this.toggleTools(server.name)}>
                <div className='mcp-toggle-indicator'><span className='mcp-toggle-icon'>{isExpanded ? '▼' : '►'}</span></div>
                <div className='mcp-tools-label-container'><span className='mcp-section-label'>{nls.localize('theia/ai/mcpConfiguration/tools', 'Tools: ')}</span></div>
                <div className='mcp-tools-actions'>
                    <button
                        className='mcp-copy-tool-button'
                        title={nls.localize('theia/ai/mcpConfiguration/copyAllList', 'Copy all (list of all tools)')}
                        onClick={event => {
                            event.stopPropagation();
                            navigator.clipboard.writeText(tools.map(tool => `~{mcp_${server.name}_${tool.name}}`).join('\n'));
                            this.messageService.info(nls.localize('theia/ai/mcpConfiguration/copiedAllList', 'Copied all tools to clipboard (list of all tools)'));
                        }}
                    ><i className={codicon('versions')}></i></button>
                    <button
                        className='mcp-copy-tool-button'
                        title={nls.localize('theia/ai/mcpConfiguration/copyForPromptTemplate', 'Copy all for prompt template (single prompt fragment with all tools)')}
                        onClick={event => {
                            event.stopPropagation();
                            navigator.clipboard.writeText(`{{${PROMPT_VARIABLE.name}:${this.mcpFrontendService.getPromptTemplateId(server.name)}}}`);
                            this.messageService.info(nls.localize('theia/ai/mcpConfiguration/copiedForPromptTemplate',
                                'Copied all tools to clipboard for prompt template (single prompt fragment with all tools)'));
                        }}
                    ><i className={codicon('bracket')}></i></button>
                    <button
                        className='mcp-copy-tool-button'
                        title={nls.localize('theia/ai/mcpConfiguration/copyAllSingle', 'Copy all for chat (single prompt fragment with all tools)')}
                        onClick={event => {
                            event.stopPropagation();
                            navigator.clipboard.writeText(`#${PROMPT_VARIABLE.name}:${this.mcpFrontendService.getPromptTemplateId(server.name)}`);
                            this.messageService.info(nls.localize('theia/ai/mcpConfiguration/copiedAllSingle',
                                'Copied all tools to clipboard (single prompt fragment with all tools)'));
                        }}
                    ><i className={codicon('copy')}></i></button>
                </div>
            </div>
            {isExpanded && <div className='mcp-tools-list'>
                {tools.map(tool => <div key={tool.name} className='mcp-tool-item'>
                    <div className='mcp-tool-content'><strong>{tool.name}:</strong> {tool.description}</div>
                    <div className='mcp-tool-actions'>
                        <button
                            className='mcp-copy-tool-button'
                            title={nls.localize('theia/ai/mcpConfiguration/copyForPrompt', 'Copy tool (for chat or prompt template)')}
                            onClick={event => {
                                event.stopPropagation();
                                const copied = `~{mcp_${server.name}_${tool.name}}`;
                                navigator.clipboard.writeText(copied);
                                this.messageService.info(nls.localize('theia/ai/mcpConfiguration/copiedForPrompt',
                                    'Copied {0} to clipboard (for chat or prompt template)', copied));
                            }}
                        ><i className={codicon('copy')}></i></button>
                    </div>
                </div>)}
            </div>}
        </div>;
    }

    protected toggleTools(serverName: string): void {
        this.expandedTools[serverName] = !this.expandedTools[serverName];
        this.onDidChangeEmitter.fire();
    }

    protected async handleStartServer(server: MCPServerDescription): Promise<void> {
        try {
            if (server.status === MCPServerStatus.AuthenticationRequired) {
                await this.mcpFrontendService.stopServer(server.name);
            }
            await this.mcpFrontendService.startServerInteractive(server.name);
        } catch (error) {
            console.error(`Failed to start MCP server "${server.name}"`, error);
            this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/startServerFailed', 'Failed to start MCP server "{0}".', server.name));
        }
    }

    protected async handleStopServer(serverName: string): Promise<void> {
        try {
            await this.mcpFrontendService.stopServer(serverName);
        } catch (error) {
            console.error(`Failed to stop MCP server "${serverName}"`, error);
            this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/stopServerFailed', 'Failed to stop MCP server "{0}".', serverName));
        }
    }

    protected async handleSignInServer(serverName: string): Promise<void> {
        try {
            const signedIn = await this.mcpFrontendService.signIn(serverName);
            if (signedIn) {
                this.messageService.info(nls.localize('theia/ai/mcpConfiguration/signInServerSucceeded', 'Signed in to MCP server "{0}".', serverName));
            } else {
                this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/signInServerNotCompleted', 'Sign-in to MCP server "{0}" was not completed.', serverName));
            }
        } catch (error) {
            console.error(`Failed to sign in to MCP server "${serverName}"`, error);
            this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/signInServerFailed', 'Failed to sign in to MCP server "{0}".', serverName));
        }
    }

    protected async handleSignOutServer(serverName: string): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/mcpConfiguration/signOutServerDialogTitle', 'Sign Out from MCP Server'),
            msg: nls.localize('theia/ai/mcpConfiguration/signOutServerDialogMsg',
                'Are you sure you want to sign out from the server "{0}"? This deletes the stored OAuth tokens for this server.', serverName),
            ok: nls.localizeByDefault('Sign Out'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if ((await dialog.open()) === true) {
            try {
                await this.mcpFrontendService.signOut(serverName);
            } catch (error) {
                console.error(`Failed to sign out from MCP server "${serverName}"`, error);
                this.messageService.warn(nls.localize('theia/ai/mcpConfiguration/signOutServerFailed', 'Failed to sign out from MCP server "{0}".', serverName));
            }
        }
    }

    protected async handleDeleteServer(serverName: string): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/mcpConfiguration/deleteServerDialogTitle', 'Delete MCP Server'),
            msg: nls.localize('theia/ai/mcpConfiguration/deleteServerDialogMsg', 'Are you sure you want to delete the server "{0}"?', serverName),
            ok: nls.localizeByDefault('Delete'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            try {
                const currentServers = this.preferenceService.get<Record<string, object>>(MCP_SERVERS_PREF, {}) ?? {};
                const newServers = { ...currentServers };
                delete newServers[serverName];
                await this.preferenceService.set(MCP_SERVERS_PREF, newServers, PreferenceScope.User);
            } catch (error) {
                this.messageService.error(nls.localize('theia/ai/mcpConfiguration/deleteServerError', 'Failed to delete MCP server: {0}', String(error)));
            }
        }
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const serverTypeLabel = nls.localize('theia/ai/mcpConfiguration/serverTypeLabel', 'MCP server');
        const toolTypeLabel = nls.localizeByDefault('Tool');
        const items: AiConfigurationSearchItem[] = [];
        for (const server of this.servers) {
            items.push({
                label: server.name,
                typeLabel: serverTypeLabel,
                categoryId: this.id,
                target: { categoryId: this.id, itemId: server.name },
                keywords: server.tools?.map(tool => tool.name).join(' ') ?? ''
            });
            for (const tool of server.tools ?? []) {
                items.push({
                    label: tool.name,
                    typeLabel: toolTypeLabel,
                    categoryId: this.id,
                    target: { categoryId: this.id, itemId: server.name },
                    keywords: `${server.name} ${tool.description ?? ''}`
                });
            }
        }
        return items;
    }
}
