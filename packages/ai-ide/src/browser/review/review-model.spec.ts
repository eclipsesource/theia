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

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
import {
    DiffHunk,
    HunkRef,
    ReviewChangeSet,
    ReviewFileChange,
    ReviewResult,
    ReviewArea,
    ReviewAreaFile,
    ReviewAreaDisposition,
} from './review-model';

describe('Review Model Types', () => {

    it('should create a valid ReviewChangeSet', () => {
        const cs: ReviewChangeSet = {
            id: 'test-cs-1',
            label: 'Working tree changes',
            source: 'git-worktree',
            files: [],
        };
        expect(cs.id).to.equal('test-cs-1');
        expect(cs.label).to.equal('Working tree changes');
        expect(cs.source).to.equal('git-worktree');
        expect(cs.files).to.be.empty;
        expect(cs.metadata).to.be.undefined;
    });

    it('should create a ReviewChangeSet with metadata', () => {
        const cs: ReviewChangeSet = {
            id: 'test-cs-2',
            label: 'PR #42',
            source: 'github-pr',
            files: [],
            metadata: { prUrl: 'https://github.com/test/repo/pull/42' },
        };
        expect(cs.metadata).to.deep.equal({ prUrl: 'https://github.com/test/repo/pull/42' });
    });

    it('should create a valid ReviewFileChange', () => {
        const fileChange: ReviewFileChange = {
            uri: new URI('file:///test/src/foo.ts'),
            originalUri: new URI('git:///test/src/foo.ts?HEAD'),
            modifiedUri: new URI('file:///test/src/foo.ts'),
            status: 'modified',
        };
        expect(fileChange.status).to.equal('modified');
        expect(fileChange.uri.path.base).to.equal('foo.ts');
        expect(fileChange.oldPath).to.be.undefined;
    });

    it('should create a ReviewFileChange with hunks', () => {
        const hunks: DiffHunk[] = [{
            id: 'hunk-1',
            modifiedRange: Range.create(10, 0, 15, 0),
            originalRange: Range.create(10, 0, 12, 0),
            content: '- old line\n+ new line',
            type: 'modified',
        }];
        const fileChange: ReviewFileChange = {
            uri: new URI('file:///test/src/foo.ts'),
            status: 'modified',
            hunks,
        };
        expect(fileChange.hunks).to.have.length(1);
        expect(fileChange.hunks![0].id).to.equal('hunk-1');
        expect(fileChange.hunks![0].type).to.equal('modified');
    });

    it('should support all file change statuses', () => {
        const statuses: ReviewFileChange['status'][] = ['added', 'modified', 'deleted', 'renamed'];
        for (const status of statuses) {
            const fc: ReviewFileChange = {
                uri: new URI('file:///test/file.ts'),
                status,
            };
            expect(fc.status).to.equal(status);
        }
    });

    it('should create a valid ReviewResult', () => {
        const result: ReviewResult = {
            id: 'review-1',
            changeSetId: 'cs-1',
            timestamp: '2026-01-01T00:00:00Z',
            summary: 'This change adds new functionality.',
            areas: [],
        };
        expect(result.id).to.equal('review-1');
        expect(result.summary).to.equal('This change adds new functionality.');
        expect(result.areas).to.be.empty;
    });

    it('should create a valid ReviewArea with disposition', () => {
        const areaFile: ReviewAreaFile = {
            path: 'src/service.ts',
            hunkRefs: [{ hunkId: 'hunk-1' }],
            ranges: [{ start: { line: 10, character: 0 }, end: { line: 25, character: 0 } }],
        };
        const area: ReviewArea = {
            id: 'area-1',
            label: 'New authentication middleware',
            description: 'Adds JWT validation for API routes.',
            files: [areaFile],
            disposition: 'reviewed',
            developerNotes: 'Looks good.',
        };
        expect(area.label).to.equal('New authentication middleware');
        expect(area.files).to.have.length(1);
        expect(area.files[0].ranges).to.have.length(1);
        expect(area.files[0].hunkRefs).to.have.length(1);
        expect(area.disposition).to.equal('reviewed');
        expect(area.developerNotes).to.equal('Looks good.');
    });

    it('should support all disposition values', () => {
        const dispositions: ReviewAreaDisposition[] = ['reviewed', 'needs-work', 'dismissed'];
        for (const disposition of dispositions) {
            const area: ReviewArea = {
                id: 'area-test',
                label: 'Test',
                description: 'Test',
                files: [],
                disposition,
            };
            expect(area.disposition).to.equal(disposition);
        }
    });

    it('should create a DiffHunk for added content', () => {
        const hunk: DiffHunk = {
            id: 'hunk-1',
            modifiedRange: Range.create(0, 0, 49, 0),
            originalRange: Range.create(0, 0, 0, 0),
            content: '+ line 1\n+ line 2',
            type: 'added',
        };
        expect(hunk.id).to.equal('hunk-1');
        expect(hunk.type).to.equal('added');
        expect(hunk.modifiedRange.start.line).to.equal(0);
        expect(hunk.modifiedRange.end.line).to.equal(49);
    });

    it('should create a DiffHunk for deleted content', () => {
        const hunk: DiffHunk = {
            id: 'hunk-1',
            modifiedRange: Range.create(0, 0, 0, 0),
            originalRange: Range.create(0, 0, 29, 0),
            content: '- removed line 1\n- removed line 2',
            type: 'deleted',
        };
        expect(hunk.type).to.equal('deleted');
        expect(hunk.originalRange.end.line).to.equal(29);
    });

    it('should create a DiffHunk for modified content', () => {
        const hunk: DiffHunk = {
            id: 'hunk-2',
            modifiedRange: Range.create(10, 0, 15, 0),
            originalRange: Range.create(10, 0, 12, 0),
            content: '- old\n+ new\n+ extra',
            type: 'modified',
        };
        expect(hunk.type).to.equal('modified');
        expect(hunk.modifiedRange.start.line).to.equal(10);
    });

    it('should create a whole-hunk HunkRef', () => {
        const ref: HunkRef = { hunkId: 'hunk-1' };
        expect(ref.hunkId).to.equal('hunk-1');
        expect(ref.startLine).to.be.undefined;
        expect(ref.endLine).to.be.undefined;
    });

    it('should create a sub-range HunkRef', () => {
        const ref: HunkRef = { hunkId: 'hunk-2', startLine: 385, endLine: 392 };
        expect(ref.hunkId).to.equal('hunk-2');
        expect(ref.startLine).to.equal(385);
        expect(ref.endLine).to.equal(392);
    });

    it('should create a HunkRef with an inline comment', () => {
        const ref: HunkRef = { hunkId: 'hunk-1', comment: 'Imports for the review module' };
        expect(ref.hunkId).to.equal('hunk-1');
        expect(ref.comment).to.equal('Imports for the review module');
    });

    it('should create a sub-range HunkRef with a comment', () => {
        const ref: HunkRef = { hunkId: 'hunk-2', startLine: 385, endLine: 392, comment: 'Binds the review widget factory' };
        expect(ref.comment).to.equal('Binds the review widget factory');
        expect(ref.startLine).to.equal(385);
    });

    it('should allow HunkRef comment to be undefined', () => {
        const ref: HunkRef = { hunkId: 'hunk-1' };
        expect(ref.comment).to.be.undefined;
    });

    it('should create a ReviewAreaFile with hunkRefs and ranges', () => {
        const areaFile: ReviewAreaFile = {
            path: 'src/module.ts',
            hunkRefs: [
                { hunkId: 'hunk-1' },
                { hunkId: 'hunk-2', startLine: 50, endLine: 55 },
            ],
            ranges: [
                Range.create(10, 0, 20, 0),
                Range.create(50, 0, 55, 0),
            ],
        };
        expect(areaFile.hunkRefs).to.have.length(2);
        expect(areaFile.ranges).to.have.length(2);
        expect(areaFile.hunkRefs[0].hunkId).to.equal('hunk-1');
        expect(areaFile.hunkRefs[1].startLine).to.equal(50);
    });

    it('should create a ReviewAreaFile with a file-level comment', () => {
        const areaFile: ReviewAreaFile = {
            path: 'src/frontend-module.ts',
            hunkRefs: [{ hunkId: 'hunk-1' }],
            ranges: [Range.create(10, 0, 20, 0)],
            comment: 'Adds DI bindings for the review framework components',
        };
        expect(areaFile.comment).to.equal('Adds DI bindings for the review framework components');
    });

    it('should allow ReviewAreaFile comment to be undefined', () => {
        const areaFile: ReviewAreaFile = {
            path: 'src/module.ts',
            hunkRefs: [],
            ranges: [],
        };
        expect(areaFile.comment).to.be.undefined;
    });

    it('should create a ReviewAreaFile with hunk-level and file-level comments', () => {
        const areaFile: ReviewAreaFile = {
            path: 'src/module.ts',
            hunkRefs: [
                { hunkId: 'hunk-1', comment: 'Import statements' },
                { hunkId: 'hunk-2', startLine: 50, endLine: 55, comment: 'Binds the service' },
            ],
            ranges: [
                Range.create(10, 0, 20, 0),
                Range.create(50, 0, 55, 0),
            ],
            comment: 'Adds DI bindings for the module',
        };
        expect(areaFile.comment).to.equal('Adds DI bindings for the module');
        expect(areaFile.hunkRefs[0].comment).to.equal('Import statements');
        expect(areaFile.hunkRefs[1].comment).to.equal('Binds the service');
    });
});
