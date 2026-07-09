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

import URI from '@theia/core/lib/common/uri';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';

export interface ReviewChangeSet {
    id: string;
    label: string;
    source: string;
    files: ReviewFileChange[];
    metadata?: Record<string, unknown>;
}

export interface ReviewFileChange {
    uri: URI;
    originalUri?: URI;
    modifiedUri?: URI;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    oldPath?: string;
}

export type ReviewAreaDisposition = 'reviewed' | 'needs-work' | 'dismissed';

export interface ReviewResult {
    id: string;
    changeSetId: string;
    timestamp: string;
    summary: string;
    areas: ReviewArea[];
}

export interface ReviewArea {
    id: string;
    label: string;
    description: string;
    files: ReviewAreaFile[];
    disposition?: ReviewAreaDisposition;
    developerNotes?: string;
}

export interface ReviewAreaFile {
    path: string;
    ranges: Range[];
}
