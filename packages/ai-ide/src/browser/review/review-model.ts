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

export interface DiffHunk {
    /** Stable ID for AI grouping (e.g., 'hunk-1', 'hunk-2') */
    id: string;
    /** Line range in the modified file (0-based, used for decorations) */
    modifiedRange: Range;
    /** Line range in the original file (0-based) */
    originalRange: Range;
    /** The actual diff content: removed lines prefixed with -, added lines with + */
    content: string;
    /** Type of change */
    type: 'added' | 'modified' | 'deleted';
}

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
    /** Deterministic diff hunks, computed when the change set is created */
    hunks?: DiffHunk[];
}

export type ReviewAreaDisposition = 'reviewed' | 'needs-work' | 'dismissed';

export interface ReviewIntent {
    id: string;
    source: 'task-context' | 'chat-session' | 'manual';
    label: string;
    content: string;
}

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

/** A reference to a hunk or a sub-range within a hunk */
export interface HunkRef {
    /** The hunk ID (e.g., 'hunk-1') */
    hunkId: string;
    /**
     * Optional sub-range start line (absolute line number in the modified file).
     * When omitted (together with endLine), the entire hunk range is used.
     * When provided, clamped to the hunk's modifiedRange bounds during resolution.
     */
    startLine?: number;
    /**
     * Optional sub-range end line (absolute line number in the modified file).
     * When omitted (together with startLine), the entire hunk range is used.
     * When provided, clamped to the hunk's modifiedRange bounds during resolution.
     */
    endLine?: number;
    /** Inline comment for this specific hunk/sub-range in the context of its area */
    comment?: string;
}

export interface ReviewAreaFile {
    path: string;
    /** References to DiffHunks (or sub-ranges within them) that this area covers */
    hunkRefs: HunkRef[];
    /** Resolved ranges — populated by resolving hunkRefs against the change set's hunks */
    ranges: Range[];
    /** File-level comment: what this area's changes do in this specific file */
    comment?: string;
}
