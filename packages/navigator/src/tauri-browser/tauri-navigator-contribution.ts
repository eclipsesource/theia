// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MessageService, SelectionService, URI } from '@theia/core';
import {
    CommonCommands, FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry,
    OpenerService, OpenWithService, WidgetManager, open
} from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common';
import { UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { TauriNativeService } from '@theia/core/lib/tauri-common/tauri-native-service';
import { getTauriRemoteSessionId } from '@theia/core/lib/tauri-common/tauri-remote-session';
import { inject, injectable } from '@theia/core/shared/inversify';
import { DirNode } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { NavigatorContextMenu, SHELL_TABBAR_CONTEXT_REVEAL } from '../browser/navigator-contribution';
import { WorkspaceNode } from '../browser/navigator-tree';
import { FILE_NAVIGATOR_ID, FileNavigatorWidget } from '../browser/navigator-widget';
import { TauriSystemAppService } from '../tauri-common/tauri-system-app-service';

export const TAURI_OPEN_CONTAINING_FOLDER = Command.toDefaultLocalizedCommand({
    id: 'revealFileInOS', category: CommonCommands.FILE_CATEGORY, label: 'Open Containing Folder'
});
export const TAURI_OPEN_WITH_SYSTEM_APP = Command.toLocalizedCommand({
    id: 'openWithSystemApp', category: CommonCommands.FILE_CATEGORY, label: 'Open With System Editor'
}, 'theia/navigator/openWithSystemEditor');

@injectable()
export class TauriNavigatorContribution implements CommandContribution, MenuContribution, KeybindingContribution, FrontendApplicationContribution {
    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(OpenWithService) protected readonly openWithService: OpenWithService;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(TauriSystemAppService) protected readonly systemAppService: TauriSystemAppService;
    @inject(TauriNativeService) protected readonly nativeService: TauriNativeService;
    @inject(WidgetManager) protected readonly widgetManager: WidgetManager;
    @inject(OpenerService) protected readonly openerService: OpenerService;

    onStart(): void {
        window.addEventListener('theia-tauri-file-drop', event => {
            const detail = (event as CustomEvent<unknown>).detail;
            if (typeof detail === 'object' && detail && 'id' in detail && typeof detail.id === 'string'
                && /^[0-9a-f]{32}$/.test(detail.id) && 'x' in detail && typeof detail.x === 'number'
                && 'y' in detail && typeof detail.y === 'number') {
                this.handleFileDrop(detail.id, detail.x, detail.y).catch(error =>
                    this.messageService.error(error instanceof Error ? error.message : String(error)));
            }
        });
    }

    protected async handleFileDrop(id: string, x: number, y: number): Promise<void> {
        const element = document.elementFromPoint(x, y);
        const navigator = await this.widgetManager.getWidget<FileNavigatorWidget>(FILE_NAVIGATOR_ID);
        if (!element || !navigator) {
            return;
        }
        const bounds = navigator.node.getBoundingClientRect();
        if (x < bounds.left || x >= bounds.right || y < bounds.top || y >= bounds.bottom
            || !navigator.node.contains(element) && !element.contains(navigator.node)) {
            return;
        }
        const nodeId = element.closest('[data-node-id]')?.getAttribute('data-node-id');
        const node = nodeId ? navigator.model.getNode(nodeId) : navigator.getContainerTreeNode();
        const directory = DirNode.getContainingDir(WorkspaceNode.is(node) ? node.children[node.children.length - 1] : node);
        if (!directory) {
            return;
        }
        if (getTauriRemoteSessionId(window.location.href)) {
            this.messageService.warn(nls.localize('theia/navigator/remoteDropUpload', 'Use Upload Files... to add local files to a remote workspace.'));
            return;
        }
        const copied = await this.nativeService.copyDroppedFiles(id, directory.fileStat.resource.toString());
        await navigator.model.refresh(directory);
        if (copied.length === 1) {
            await open(this.openerService, new URI(copied[0]));
        }
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TAURI_OPEN_CONTAINING_FOLDER, UriAwareCommandHandler.MonoSelect(this.selectionService, {
            execute: uri => this.reportError(this.systemAppService.openContainingFolder(uri.toString())),
            isEnabled: uri => this.isLocalWorkspaceFile(uri),
            isVisible: uri => this.isLocalWorkspaceFile(uri)
        }));
        commands.registerCommand(TAURI_OPEN_WITH_SYSTEM_APP, UriAwareCommandHandler.MonoSelect(this.selectionService, {
            execute: uri => this.openWithSystemApplication(uri),
            isEnabled: uri => uri.scheme === 'file',
            isVisible: uri => uri.scheme === 'file'
        }));
        this.openWithService.registerHandler({
            id: 'system-editor',
            label: nls.localize('theia/navigator/systemEditor', 'System Editor'),
            providerName: nls.localizeByDefault('Built-in'),
            canHandle: uri => uri.scheme === 'file' ? 10 : 0,
            open: uri => {
                this.openWithSystemApplication(uri);
                return {};
            }
        });
    }

    protected isLocalWorkspaceFile(uri: URI): boolean {
        return uri.scheme === 'file' && !!this.workspaceService.getWorkspaceRootUri(uri);
    }

    protected openWithSystemApplication(uri: URI): void {
        if (uri.scheme === 'file') {
            this.reportError(this.systemAppService.openFile(uri.toString()));
        }
    }

    protected async reportError(operation: Promise<void>): Promise<void> {
        try {
            await operation;
        } catch (error) {
            this.messageService.error(`Could not open system application: ${error}`);
        }
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NavigatorContextMenu.NAVIGATION, {
            commandId: TAURI_OPEN_CONTAINING_FOLDER.id,
            label: TAURI_OPEN_CONTAINING_FOLDER.label
        });
        menus.registerMenuAction(SHELL_TABBAR_CONTEXT_REVEAL, {
            commandId: TAURI_OPEN_CONTAINING_FOLDER.id,
            label: TAURI_OPEN_CONTAINING_FOLDER.label,
            order: '4'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({ command: TAURI_OPEN_CONTAINING_FOLDER.id, keybinding: 'ctrlcmd+alt+p', when: 'filesExplorerFocus' });
    }
}
