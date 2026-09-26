// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core';
import { FileUri } from '@theia/core/lib/common/file-uri';
import URI from '@theia/core/lib/common/uri';
import { TauriNativeBackendService } from '@theia/core/lib/tauri-node/tauri-native-backend-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PluginDebugConfiguration } from '../common/plugin-dev-protocol';
import { AbstractHostedInstanceManager } from '../node/hosted-instance-manager';

/** Runs a development plugin in a controller-owned Tauri window and backend. */
@injectable()
export class TauriHostedPluginRunner extends AbstractHostedInstanceManager {
    @inject(TauriNativeBackendService)
    protected readonly nativeService: TauriNativeBackendService;

    protected hostedLabel: string | undefined;
    protected exitListener: Disposable | undefined;

    override async run(pluginUri: URI, port?: number): Promise<URI> {
        if (port !== undefined) {
            throw new Error('A fixed hosted-plugin port is not supported by Tauri');
        }
        return this.launch(pluginUri, []);
    }

    override async debug(pluginUri: URI, config: PluginDebugConfiguration): Promise<URI> {
        const mode = config.debugMode || 'inspect';
        if (mode !== 'inspect' && mode !== 'inspect-brk') {
            throw new Error('Unsupported hosted-plugin debug mode');
        }
        const debugPort = config.debugPort;
        const debugArgs = typeof debugPort === 'string'
            ? [`--hosted-plugin-${mode}=127.0.0.1:${debugPort}`]
            : Array.isArray(debugPort) && debugPort.length
                ? debugPort.map(({ serverName, debugPort: selectedPort }) => `--${serverName}-${mode}=127.0.0.1:${selectedPort}`)
                : [`--hosted-plugin-${mode}=127.0.0.1`];
        if (debugArgs.length > 8 || !debugArgs.every(arg =>
            /^--[a-z][a-z0-9-]{0,40}-(?:inspect|inspect-brk)=127\.0\.0\.1(?::[0-9]{1,5})?$/.test(arg))) {
            throw new Error('Invalid hosted-plugin debug arguments');
        }
        return this.launch(pluginUri, debugArgs);
    }

    protected async launch(pluginUri: URI, debugArgs: string[]): Promise<URI> {
        if (this.isPluginRunning) {
            throw new Error('Hosted instance is already running.');
        }
        if (pluginUri.scheme !== 'file' || !await this.isPluginValid(pluginUri)) {
            throw new Error('Hosted plugin must be a local, valid plugin directory');
        }
        const result = await this.nativeService.openHostedPlugin(FileUri.fsPath(pluginUri.toString()), debugArgs);
        this.hostedLabel = result.label;
        this.pluginUri = pluginUri;
        this.instanceUri = new URI(result.url);
        this.isPluginRunning = true;
        this.exitListener?.dispose();
        this.exitListener = this.nativeService.onDidHostedPluginExit(label => {
            if (label === this.hostedLabel) {
                this.isPluginRunning = false;
                this.hostedLabel = undefined;
                this.exitListener?.dispose();
                this.exitListener = undefined;
            }
        });
        return this.instanceUri;
    }

    override async terminate(): Promise<void> {
        if (!this.isPluginRunning || !this.hostedLabel) {
            throw new Error('Hosted plugin instance is not running.');
        }
        await this.nativeService.stopHostedPlugin(this.hostedLabel);
        this.isPluginRunning = false;
        this.hostedLabel = undefined;
        this.exitListener?.dispose();
        this.exitListener = undefined;
    }
}
