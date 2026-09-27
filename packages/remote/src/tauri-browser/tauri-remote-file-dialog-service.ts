// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MaybeArray, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { DefaultFileDialogService, OpenFileDialogProps, SaveFileDialogProps } from '@theia/filesystem/lib/browser/file-dialog';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { TauriFileDialogService } from '@theia/filesystem/lib/tauri-browser/file-dialog/tauri-file-dialog-service';
import { RemoteService } from '../electron-browser/remote-service';

@injectable()
export class TauriRemoteFileDialogService extends TauriFileDialogService {
    @inject(RemoteService) protected readonly remoteService: RemoteService;

    override showOpenDialog(props: OpenFileDialogProps & { canSelectMany: true }, folder?: FileStat): Promise<MaybeArray<URI> | undefined>;
    override showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<URI | undefined>;
    override showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<MaybeArray<URI> | undefined> {
        if (this.remoteService.isConnected()) {
            return DefaultFileDialogService.prototype.showOpenDialog.call(this, props, folder);
        }
        return super.showOpenDialog(props, folder);
    }

    override showSaveDialog(props: SaveFileDialogProps, folder?: FileStat): Promise<URI | undefined> {
        if (this.remoteService.isConnected()) {
            return DefaultFileDialogService.prototype.showSaveDialog.call(this, props, folder);
        }
        return super.showSaveDialog(props, folder);
    }
}
