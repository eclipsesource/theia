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
import { ReviewSummaryService } from './review-summary-agent';
import { DiffHunk, HunkRef, ReviewArea, ReviewAreaFile, ReviewChangeSet } from './review-model';

describe('ReviewSummaryService — hunk resolution', () => {
    let service: ReviewSummaryService;
    const warnings: string[] = [];

    before(() => {
        service = new ReviewSummaryService();
        // Provide a mock logger
        (service as unknown as { logger: { warn: (msg: string) => void } }).logger = {
            warn: (msg: string) => { warnings.push(msg); },
        };
    });

    beforeEach(() => {
        warnings.length = 0;
    });

    function makeHunk(id: string, startLine: number, endLine: number, type: DiffHunk['type'] = 'modified'): DiffHunk {
        return {
            id,
            modifiedRange: Range.create(startLine, 0, endLine, 0),
            originalRange: Range.create(startLine, 0, endLine, 0),
            content: '+ test',
            type,
        };
    }

    function makeChangeSet(hunks: DiffHunk[], filePath: string = '/test/src/module.ts'): ReviewChangeSet {
        return {
            id: 'cs-1',
            label: 'test',
            source: 'test',
            files: [{
                uri: new URI(`file://${filePath}`),
                status: 'modified',
                hunks,
            }],
        };
    }

    function makeAreaFile(path: string, hunkRefs: HunkRef[]): ReviewAreaFile {
        return { path, hunkRefs, ranges: [] };
    }

    function makeArea(files: ReviewAreaFile[]): ReviewArea {
        return { id: 'area-1', label: 'Test Area', description: 'desc', files };
    }

    describe('resolveRef', () => {
        it('should resolve a whole-hunk reference to the full hunk range', () => {
            const hunk = makeHunk('hunk-1', 10, 20);
            const fileHunks = new Map([['hunk-1', hunk]]);
            const ref: HunkRef = { hunkId: 'hunk-1' };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.deep.equal(Range.create(10, 0, 20, 0));
        });

        it('should resolve a sub-range within a hunk', () => {
            const hunk = makeHunk('hunk-1', 10, 30);
            const fileHunks = new Map([['hunk-1', hunk]]);
            const ref: HunkRef = { hunkId: 'hunk-1', startLine: 15, endLine: 25 };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.deep.equal(Range.create(15, 0, 25, 0));
        });

        it('should clamp sub-range to hunk bounds (start before hunk)', () => {
            const hunk = makeHunk('hunk-1', 10, 20);
            const fileHunks = new Map([['hunk-1', hunk]]);
            const ref: HunkRef = { hunkId: 'hunk-1', startLine: 5, endLine: 15 };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.deep.equal(Range.create(10, 0, 15, 0));
        });

        it('should clamp sub-range to hunk bounds (end after hunk)', () => {
            const hunk = makeHunk('hunk-1', 10, 20);
            const fileHunks = new Map([['hunk-1', hunk]]);
            const ref: HunkRef = { hunkId: 'hunk-1', startLine: 15, endLine: 30 };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.deep.equal(Range.create(15, 0, 20, 0));
        });

        it('should clamp sub-range on both sides', () => {
            const hunk = makeHunk('hunk-1', 10, 20);
            const fileHunks = new Map([['hunk-1', hunk]]);
            const ref: HunkRef = { hunkId: 'hunk-1', startLine: 5, endLine: 30 };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.deep.equal(Range.create(10, 0, 20, 0));
        });

        it('should fall back to full hunk when sub-range is completely outside', () => {
            const hunk = makeHunk('hunk-1', 10, 20);
            const fileHunks = new Map([['hunk-1', hunk]]);
            const ref: HunkRef = { hunkId: 'hunk-1', startLine: 25, endLine: 30 };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.deep.equal(Range.create(10, 0, 20, 0));
            expect(warnings).to.have.length(1);
            expect(warnings[0]).to.include('falls outside hunk bounds');
        });

        it('should return undefined for unknown hunk ID', () => {
            const fileHunks = new Map([['hunk-1', makeHunk('hunk-1', 10, 20)]]);
            const ref: HunkRef = { hunkId: 'hunk-999' };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.be.undefined;
            expect(warnings).to.have.length(1);
            expect(warnings[0]).to.include('Unknown hunk ID');
        });

        it('should return undefined when fileHunks is undefined', () => {
            const ref: HunkRef = { hunkId: 'hunk-1' };

            const result = service.resolveRef(ref, undefined);

            expect(result).to.be.undefined;
        });

        it('should treat startLine without endLine as whole-hunk reference', () => {
            const hunk = makeHunk('hunk-1', 10, 20);
            const fileHunks = new Map([['hunk-1', hunk]]);
            const ref: HunkRef = { hunkId: 'hunk-1', startLine: 15 };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.deep.equal(Range.create(10, 0, 20, 0));
        });

        it('should treat endLine without startLine as whole-hunk reference', () => {
            const hunk = makeHunk('hunk-1', 10, 20);
            const fileHunks = new Map([['hunk-1', hunk]]);
            const ref: HunkRef = { hunkId: 'hunk-1', endLine: 15 };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.deep.equal(Range.create(10, 0, 20, 0));
        });

        it('should resolve single-line sub-range (startLine equals endLine)', () => {
            const hunk = makeHunk('hunk-1', 10, 20);
            const fileHunks = new Map([['hunk-1', hunk]]);
            const ref: HunkRef = { hunkId: 'hunk-1', startLine: 15, endLine: 15 };

            const result = service.resolveRef(ref, fileHunks);

            expect(result).to.deep.equal(Range.create(15, 0, 15, 0));
        });
    });

    describe('resolveHunkRanges', () => {
        it('should resolve all hunkRefs to ranges for a single file', () => {
            const cs = makeChangeSet([
                makeHunk('hunk-1', 10, 20),
                makeHunk('hunk-2', 50, 60),
            ]);
            const areas: ReviewArea[] = [
                makeArea([makeAreaFile('src/module.ts', [
                    { hunkId: 'hunk-1' },
                    { hunkId: 'hunk-2' },
                ])]),
            ];

            service.resolveHunkRanges(areas, cs);

            expect(areas[0].files[0].ranges).to.have.length(2);
            expect(areas[0].files[0].ranges[0]).to.deep.equal(Range.create(10, 0, 20, 0));
            expect(areas[0].files[0].ranges[1]).to.deep.equal(Range.create(50, 0, 60, 0));
        });

        it('should allow splitting a hunk across multiple areas', () => {
            const cs = makeChangeSet([makeHunk('hunk-1', 10, 30)]);
            const areas: ReviewArea[] = [
                makeArea([makeAreaFile('src/module.ts', [
                    { hunkId: 'hunk-1', startLine: 10, endLine: 18 },
                ])]),
                {
                    id: 'area-2', label: 'Area 2', description: 'desc',
                    files: [makeAreaFile('src/module.ts', [
                        { hunkId: 'hunk-1', startLine: 20, endLine: 30 },
                    ])],
                },
            ];

            service.resolveHunkRanges(areas, cs);

            expect(areas[0].files[0].ranges[0]).to.deep.equal(Range.create(10, 0, 18, 0));
            expect(areas[1].files[0].ranges[0]).to.deep.equal(Range.create(20, 0, 30, 0));
        });

        it('should filter out unknown hunk IDs and produce empty ranges', () => {
            const cs = makeChangeSet([makeHunk('hunk-1', 10, 20)]);
            const areas: ReviewArea[] = [
                makeArea([makeAreaFile('src/module.ts', [
                    { hunkId: 'hunk-999' },
                ])]),
            ];

            service.resolveHunkRanges(areas, cs);

            expect(areas[0].files[0].ranges).to.be.empty;
            expect(warnings).to.have.length(1);
        });

        it('should fall back to all file hunks when hunkRefs is empty', () => {
            const cs = makeChangeSet([
                makeHunk('hunk-1', 10, 20),
                makeHunk('hunk-2', 50, 60),
            ]);
            const areas: ReviewArea[] = [
                makeArea([makeAreaFile('src/module.ts', [])]),
            ];

            service.resolveHunkRanges(areas, cs);

            expect(areas[0].files[0].ranges).to.have.length(2);
            expect(areas[0].files[0].ranges[0]).to.deep.equal(Range.create(10, 0, 20, 0));
            expect(areas[0].files[0].ranges[1]).to.deep.equal(Range.create(50, 0, 60, 0));
        });

        it('should fall back to all file hunks when hunkRefs field is missing', () => {
            const cs = makeChangeSet([makeHunk('hunk-1', 5, 15)]);
            const areas: ReviewArea[] = [
                makeArea([{ path: 'src/module.ts', hunkRefs: undefined as unknown as HunkRef[], ranges: [] }]),
            ];

            service.resolveHunkRanges(areas, cs);

            expect(areas[0].files[0].ranges).to.have.length(1);
            expect(areas[0].files[0].ranges[0]).to.deep.equal(Range.create(5, 0, 15, 0));
        });

        it('should return empty ranges when hunkRefs is empty and file has no hunks', () => {
            const cs: ReviewChangeSet = {
                id: 'cs-1',
                label: 'test',
                source: 'test',
                files: [{
                    uri: new URI('file:///test/src/module.ts'),
                    status: 'modified',
                    hunks: [],
                }],
            };
            const areas: ReviewArea[] = [
                makeArea([makeAreaFile('src/module.ts', [])]),
            ];

            service.resolveHunkRanges(areas, cs);

            expect(areas[0].files[0].ranges).to.be.empty;
        });

        it('should match file paths by suffix', () => {
            const cs = makeChangeSet([makeHunk('hunk-1', 5, 15)], '/workspace/project/src/module.ts');
            const areas: ReviewArea[] = [
                makeArea([makeAreaFile('src/module.ts', [{ hunkId: 'hunk-1' }])]),
            ];

            service.resolveHunkRanges(areas, cs);

            expect(areas[0].files[0].ranges).to.have.length(1);
            expect(areas[0].files[0].ranges[0]).to.deep.equal(Range.create(5, 0, 15, 0));
        });
    });
});
