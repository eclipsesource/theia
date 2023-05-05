// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import {
    FileChange, FileDeleteOptions, FileOpenOptions,
    FileOverwriteOptions, FilePermission, FileReadStreamOptions, FileSystemProviderCapabilities,
    FileSystemProviderWithFileReadWriteCapability,
    FileType, FileUpdateOptions, FileUpdateResult, FileWriteOptions, Stat, WatchOptions
} from '../common/files';
import { Event, URI, Disposable, CancellationToken } from '@theia/core';
import { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import { ReadableStreamEvents } from '@theia/core/lib/common/stream';

@injectable()
export class MockedFileSystemProvider implements FileSystemProviderWithFileReadWriteCapability {
    capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;
    onDidChangeCapabilities: Event<void> = Event.None;
    onDidChangeFile: Event<readonly FileChange[]> = Event.None;
    onFileWatchError: Event<void> = Event.None;

    constructor() {
        console.log('Mocked FileSystemProvider created!');
    }

    watch(resource: URI, opts: WatchOptions): Disposable {
        return Disposable.NULL;
    }
    async stat(resource: URI): Promise<Stat> {
        return {
            type: FileType.File,
            mtime: 0,
            ctime: 0,
            size: 0,
            permissions: FilePermission.Readonly
        };
    }
    mkdir(resource: URI): Promise<void> {
        throw new Error('Method not implemented.');
    }
    readdir(resource: URI): Promise<[string, FileType][]> {
        throw new Error('Method not implemented.');
    }
    delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        throw new Error('Method not implemented.');
    }
    rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        throw new Error('Method not implemented.');
    }
    copy?(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        throw new Error('Method not implemented.');
    }
    async readFile(_resource: URI): Promise<Uint8Array> {
        return Uint8Array.from([]);
    }
    writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        throw new Error('Method not implemented.');
    }
    readFileStream?(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
        throw new Error('Method not implemented.');
    }
    open?(resource: URI, opts: FileOpenOptions): Promise<number> {
        throw new Error('Method not implemented.');
    }
    close?(fd: number): Promise<void> {
        throw new Error('Method not implemented.');
    }
    read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        throw new Error('Method not implemented.');
    }
    write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        throw new Error('Method not implemented.');
    }
    access?(resource: URI, mode?: number | undefined): Promise<void> {
        throw new Error('Method not implemented.');
    }
    fsPath?(resource: URI): Promise<string> {
        throw new Error('Method not implemented.');
    }
    updateFile?(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult> {
        throw new Error('Method not implemented.');
    }

}
