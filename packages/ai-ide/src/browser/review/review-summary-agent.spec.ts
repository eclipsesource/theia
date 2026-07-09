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
import { DiffHunk, HunkRef, ReviewArea, ReviewAreaFile, ReviewChangeSet, ReviewIntent } from './review-model';

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

        it('should preserve hunkRef comments during resolution', () => {
            const cs = makeChangeSet([makeHunk('hunk-1', 10, 20)]);
            const areas: ReviewArea[] = [
                makeArea([makeAreaFile('src/module.ts', [
                    { hunkId: 'hunk-1', comment: 'Import statements for the module' },
                ])]),
            ];

            service.resolveHunkRanges(areas, cs);

            expect(areas[0].files[0].ranges).to.have.length(1);
            expect(areas[0].files[0].hunkRefs[0].comment).to.equal('Import statements for the module');
        });

        it('should preserve file-level comments during resolution', () => {
            const cs = makeChangeSet([makeHunk('hunk-1', 10, 20)]);
            const areaFile = makeAreaFile('src/module.ts', [{ hunkId: 'hunk-1' }]);
            areaFile.comment = 'Adds DI bindings for the review components';
            const areas: ReviewArea[] = [makeArea([areaFile])];

            service.resolveHunkRanges(areas, cs);

            expect(areas[0].files[0].comment).to.equal('Adds DI bindings for the review components');
        });
    });

    describe('buildPrompt — intent injection', () => {
        function callBuildPrompt(cs: ReviewChangeSet, diffs: string, intents?: ReviewIntent[]): { systemMessage: string; userMessage: string } {
            return (service as unknown as { buildPrompt: (cs: ReviewChangeSet, diffs: string, intents?: ReviewIntent[]) => { systemMessage: string; userMessage: string } })
                .buildPrompt(cs, diffs, intents);
        }

        const dummyCs = makeChangeSet([makeHunk('hunk-1', 10, 20)]);

        it('should produce user message without intent section when intents is undefined', () => {
            const { userMessage } = callBuildPrompt(dummyCs, 'diffs here');

            expect(userMessage).to.include('Analyze the following change set');
            expect(userMessage).to.not.include('Developer Intent');
        });

        it('should produce user message without intent section when intents is empty', () => {
            const { userMessage } = callBuildPrompt(dummyCs, 'diffs here', []);

            expect(userMessage).to.not.include('Developer Intent');
        });

        it('should inject a single task-context intent into the user message', () => {
            const intents: ReviewIntent[] = [{
                id: 'i-1',
                source: 'task-context',
                label: 'Add review framework',
                content: 'Plan to add a review framework with DI bindings.',
            }];

            const { userMessage } = callBuildPrompt(dummyCs, 'diffs here', intents);

            expect(userMessage).to.include('# Developer Intent');
            expect(userMessage).to.include('## Task Context: Add review framework');
            expect(userMessage).to.include('Plan to add a review framework with DI bindings.');
            expect(userMessage).to.include('Analyze the following change set');
        });

        it('should inject a manual note intent', () => {
            const intents: ReviewIntent[] = [{
                id: 'i-1',
                source: 'manual',
                label: 'Check DI bindings',
                content: 'Focus on the DI binding correctness',
            }];

            const { userMessage } = callBuildPrompt(dummyCs, 'diffs here', intents);

            expect(userMessage).to.include('## Note: Check DI bindings');
            expect(userMessage).to.include('Focus on the DI binding correctness');
        });

        it('should inject a chat-session intent', () => {
            const intents: ReviewIntent[] = [{
                id: 'i-1',
                source: 'chat-session',
                label: 'Architect Session',
                content: 'Summary of the architect session',
            }];

            const { userMessage } = callBuildPrompt(dummyCs, 'diffs here', intents);

            expect(userMessage).to.include('## Chat Session: Architect Session');
        });

        it('should inject multiple intents in order', () => {
            const intents: ReviewIntent[] = [
                { id: 'i-1', source: 'task-context', label: 'Plan A', content: 'First plan' },
                { id: 'i-2', source: 'manual', label: 'Note', content: 'A note' },
                { id: 'i-3', source: 'chat-session', label: 'Session', content: 'Session summary' },
            ];

            const { userMessage } = callBuildPrompt(dummyCs, 'diffs here', intents);

            const planIdx = userMessage.indexOf('## Task Context: Plan A');
            const noteIdx = userMessage.indexOf('## Note: Note');
            const sessionIdx = userMessage.indexOf('## Chat Session: Session');
            expect(planIdx).to.be.greaterThan(-1);
            expect(noteIdx).to.be.greaterThan(planIdx);
            expect(sessionIdx).to.be.greaterThan(noteIdx);
        });

        it('should place intent section before the analysis prompt', () => {
            const intents: ReviewIntent[] = [{
                id: 'i-1',
                source: 'manual',
                label: 'Test',
                content: 'Test content',
            }];

            const { userMessage } = callBuildPrompt(dummyCs, 'diffs', intents);

            const intentIdx = userMessage.indexOf('# Developer Intent');
            const analyzeIdx = userMessage.indexOf('Analyze the following change set');
            expect(intentIdx).to.be.greaterThan(-1);
            expect(analyzeIdx).to.be.greaterThan(intentIdx);
        });
    });

    describe('parseResponse — comment extraction', () => {
        it('should parse file-level and hunk-level comments from AI response', () => {
            const cs = makeChangeSet([
                makeHunk('hunk-1', 10, 20),
                makeHunk('hunk-2', 50, 60),
            ]);
            const responseJson = JSON.stringify({
                summary: 'Test summary',
                areas: [{
                    id: 'area-1',
                    label: 'Test Area',
                    description: 'Area-level description',
                    files: [{
                        path: 'src/module.ts',
                        comment: 'File-level comment about DI bindings',
                        hunkRefs: [
                            { hunkId: 'hunk-1', comment: 'Import statements' },
                            { hunkId: 'hunk-2', startLine: 50, endLine: 60, comment: 'Service bindings' },
                        ],
                    }],
                }],
            });

            const result = (service as unknown as { parseResponse: (cs: ReviewChangeSet, text: string) => import('./review-model').ReviewResult })
                .parseResponse(cs, responseJson);

            expect(result.areas).to.have.length(1);
            const areaFile = result.areas[0].files[0];
            expect(areaFile.comment).to.equal('File-level comment about DI bindings');
            expect(areaFile.hunkRefs[0].comment).to.equal('Import statements');
            expect(areaFile.hunkRefs[1].comment).to.equal('Service bindings');
        });

        it('should handle missing comments gracefully', () => {
            const cs = makeChangeSet([makeHunk('hunk-1', 10, 20)]);
            const responseJson = JSON.stringify({
                summary: 'Test summary',
                areas: [{
                    id: 'area-1',
                    label: 'Test Area',
                    description: 'Area-level description',
                    files: [{
                        path: 'src/module.ts',
                        hunkRefs: [{ hunkId: 'hunk-1' }],
                    }],
                }],
            });

            const result = (service as unknown as { parseResponse: (cs: ReviewChangeSet, text: string) => import('./review-model').ReviewResult })
                .parseResponse(cs, responseJson);

            expect(result.areas).to.have.length(1);
            const areaFile = result.areas[0].files[0];
            expect(areaFile.comment).to.be.undefined;
            expect(areaFile.hunkRefs[0].comment).to.be.undefined;
        });
    });
});
