// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileUri } from '@theia/core/lib/common/file-uri';
import URI from '@theia/core/lib/common/uri';
import { injectable } from '@theia/core/shared/inversify';
import { TauriSystemAppService } from '../tauri-common/tauri-system-app-service';

@injectable()
export class TauriSystemAppServiceImpl implements TauriSystemAppService {
    async openFile(uri: string): Promise<void> {
        await this.open(await this.localPath(uri));
    }

    async openContainingFolder(uri: string): Promise<void> {
        const filePath = await this.localPath(uri);
        const stat = await fs.stat(filePath);
        await this.open(stat.isDirectory() ? filePath : path.dirname(filePath));
    }

    protected async localPath(uri: string): Promise<string> {
        if (typeof uri !== 'string' || uri.length > 8192) {
            throw new Error('Invalid local file URI');
        }
        const parsed = new URI(uri);
        if (parsed.scheme !== 'file' || parsed.authority || !path.isAbsolute(FileUri.fsPath(parsed))) {
            throw new Error('Only local file URIs can be opened with a system application');
        }
        const filePath = FileUri.fsPath(parsed);
        await fs.access(filePath);
        return filePath;
    }

    protected open(filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            execFile('xdg-open', [filePath], { timeout: 10000 }, error => error ? reject(error) : resolve());
        });
    }
}
