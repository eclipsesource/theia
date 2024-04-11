// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

import { Emitter, Event, URI } from '@theia/core';
import { CollectionDelta } from '../common/tree-delta';
import { injectable } from '@theia/core/shared/inversify';

export interface TestCoverageCount {
    covered: number,
    total: number
}

export interface Folder {
    readonly path: string,
    readonly name: string,
    readonly uri: URI,
    folders: Folder[];
    fileCoverages: FileCoverage[];
    clear(): void;
}

export interface FileCoverage {
    readonly uri: URI;
    readonly path: string[];
    statementCoverage: TestCoverageCount;
    branchCoverage?: TestCoverageCount;
    declarationCoverage?: TestCoverageCount;
}


export interface TestCoverageService {
    clear(): void;
    getRootFolders(): Folder[];
    onFileCoveragesChanged: Event<CollectionDelta<string, FileCoverage>>;

    refresh(): void;
}

export const TestCoverageService = Symbol('TestCoverageService');

@injectable()
export class DefaultTestCoverageService implements TestCoverageService {
    
    private rootFolders: Folder[];
    private onFileCoveragesChangedEmitter = new Emitter<CollectionDelta<string, FileCoverage>>();

    clear(): void {
        // should there be any dispose?
        this.rootFolders = [];
    }

    getRootFolders(): Folder[] {
        return this.rootFolders;
    }

    onFileCoveragesChanged: Event<CollectionDelta<string, FileCoverage>> = this.onFileCoveragesChangedEmitter.event;

    refresh(): void {
        throw new Error('Method not implemented.');
    }

}
