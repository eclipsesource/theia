// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { MaybeArray } from '@theia/core/lib/common/types';
import { MessageService } from '@theia/core/lib/common/message-service';
import { TauriFileDialogOptions, TauriNativeService } from '@theia/core/lib/tauri-common/tauri-native-service';
// The Tauri frontend and its Node backend run on the same machine.
// eslint-disable-next-line @theia/runtime-import-check
import { FileUri } from '@theia/core/lib/common/file-uri';
import { FileStat } from '../../common/files';
import { FileAccess } from '../../common/filesystem';
import { DefaultFileDialogService, OpenFileDialogProps, SaveFileDialogProps } from '../../browser/file-dialog';

@injectable()
export class TauriFileDialogService extends DefaultFileDialogService {
    @inject(TauriNativeService) protected readonly nativeService: TauriNativeService;
    @inject(MessageService) protected readonly messageService: MessageService;

    override async showOpenDialog(props: OpenFileDialogProps & { canSelectMany: true }, folder?: FileStat): Promise<MaybeArray<URI> | undefined>;
    override async showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<URI | undefined>;
    override async showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<MaybeArray<URI> | undefined> {
        // The native picker cannot mix files and directories or browse a remote filesystem.
        if (props.fileScheme && props.fileScheme !== 'file' || props.canSelectFiles !== false && props.canSelectFolders) {
            return super.showOpenDialog(props, folder);
        }
        const rootNode = await this.getRootNode(folder);
        if (!rootNode || rootNode.uri.scheme !== 'file') {
            return super.showOpenDialog(props, folder);
        }
        const options: TauriFileDialogOptions = {
            title: props.title,
            defaultPath: FileUri.fsPath(rootNode.uri),
            filters: this.toFilters(props.filters),
            directory: props.canSelectFiles === false,
            multiple: props.canSelectMany
        };
        const paths = await this.nativeService.showOpenDialog(options);
        if (!paths?.length) {
            return undefined;
        }
        const uris = paths.map(path => FileUri.create(path));
        for (const uri of uris) {
            if (!await this.fileService.access(uri, FileAccess.Constants.R_OK)) {
                this.messageService.error(`Cannot read ${uri.path}.`);
                return undefined;
            }
        }
        return uris.length === 1 ? uris[0] : uris;
    }

    override async showSaveDialog(props: SaveFileDialogProps, folder?: FileStat): Promise<URI | undefined> {
        if (props.fileScheme && props.fileScheme !== 'file') {
            return super.showSaveDialog(props, folder);
        }
        const rootNode = await this.getRootNode(folder);
        if (!rootNode || rootNode.uri.scheme !== 'file') {
            return super.showSaveDialog(props, folder);
        }
        const defaultUri = props.inputValue ? rootNode.uri.resolve(props.inputValue) : rootNode.uri;
        const path = await this.nativeService.showSaveDialog({
            title: props.title,
            defaultPath: FileUri.fsPath(defaultUri),
            filters: this.toFilters(props.filters)
        });
        if (!path) {
            return undefined;
        }
        const uri = FileUri.create(path);
        if (await this.fileService.exists(uri) && !await this.fileService.access(uri, FileAccess.Constants.R_OK | FileAccess.Constants.W_OK)) {
            this.messageService.error(`Cannot access resource at ${uri.path}.`);
            return undefined;
        }
        return uri;
    }

    protected toFilters(filters: OpenFileDialogProps['filters']): TauriFileDialogOptions['filters'] {
        return filters && Object.entries(filters).map(([name, extensions]) => ({ name, extensions }));
    }
}
