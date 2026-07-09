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
import { EditorDecoration } from '@theia/editor/lib/browser';
import { ReviewArea, ReviewAreaFile, ReviewResult } from './review-model';
import { ReviewDiffDecorator } from './review-diff-decorator';

class TestableReviewDiffDecorator extends ReviewDiffDecorator {
    setModifiedUri(uri: URI): void {
        this.activeModifiedUri = uri;
    }

    testBuildDecorations(review: ReviewResult): EditorDecoration[] {
        return this.buildDecorations(review);
    }
}

function makeAreaFile(path: string, ranges: Range[], hunkRefs: { hunkId: string; comment?: string }[] = [], comment?: string): ReviewAreaFile {
    return {
        path,
        hunkRefs: hunkRefs.map(ref => ({ hunkId: ref.hunkId, comment: ref.comment })),
        ranges,
        comment,
    };
}

function makeArea(id: string, label: string, description: string, files: ReviewAreaFile[]): ReviewArea {
    return { id, label, description, files };
}

function makeReview(areas: ReviewArea[]): ReviewResult {
    return {
        id: 'review-1',
        changeSetId: 'cs-1',
        timestamp: '2026-01-01T00:00:00Z',
        summary: 'Test review',
        areas,
    };
}

describe('ReviewDiffDecorator — buildDecorations', () => {
    let decorator: TestableReviewDiffDecorator;

    beforeEach(() => {
        decorator = new TestableReviewDiffDecorator();
        decorator.setModifiedUri(new URI('file:///workspace/src/module.ts'));
    });

    it('should use hunk comment when available', () => {
        const review = makeReview([
            makeArea('a1', 'Area 1', 'Area description', [
                makeAreaFile('src/module.ts',
                    [Range.create(10, 0, 20, 0)],
                    [{ hunkId: 'hunk-1', comment: 'Hunk-specific comment' }],
                ),
            ]),
        ]);

        const decorations = decorator.testBuildDecorations(review);

        expect(decorations).to.have.length(1);
        expect(decorations[0].options.hoverMessage).to.equal('Hunk-specific comment');
        expect(decorations[0].options.glyphMarginHoverMessage).to.include('Hunk-specific comment');
        expect(decorations[0].options.glyphMarginHoverMessage).to.include('**Area 1**');
    });

    it('should fall back to file comment when hunk comment is missing', () => {
        const review = makeReview([
            makeArea('a1', 'Area 1', 'Area description', [
                makeAreaFile('src/module.ts',
                    [Range.create(10, 0, 20, 0)],
                    [{ hunkId: 'hunk-1' }],
                    'File-level comment',
                ),
            ]),
        ]);

        const decorations = decorator.testBuildDecorations(review);

        expect(decorations).to.have.length(1);
        expect(decorations[0].options.hoverMessage).to.equal('File-level comment');
    });

    it('should fall back to area description when both hunk and file comments are missing', () => {
        const review = makeReview([
            makeArea('a1', 'Area 1', 'Area description', [
                makeAreaFile('src/module.ts',
                    [Range.create(10, 0, 20, 0)],
                    [{ hunkId: 'hunk-1' }],
                ),
            ]),
        ]);

        const decorations = decorator.testBuildDecorations(review);

        expect(decorations).to.have.length(1);
        expect(decorations[0].options.hoverMessage).to.equal('Area description');
    });

    it('should add file-comment marker on line 1 when file has comment AND hunks have comments', () => {
        const review = makeReview([
            makeArea('a1', 'Area 1', 'Area description', [
                makeAreaFile('src/module.ts',
                    [Range.create(10, 0, 20, 0), Range.create(50, 0, 60, 0)],
                    [
                        { hunkId: 'hunk-1', comment: 'Import changes' },
                        { hunkId: 'hunk-2', comment: 'Service bindings' },
                    ],
                    'Adds DI bindings for the module',
                ),
            ]),
        ]);

        const decorations = decorator.testBuildDecorations(review);

        // 1 file-level marker + 2 hunk decorations = 3
        expect(decorations).to.have.length(3);

        // First decoration: file-comment marker on line 1 (range 0,0 to 0,0)
        expect(decorations[0].range.start.line).to.equal(0);
        expect(decorations[0].range.end.line).to.equal(0);
        expect(decorations[0].options.hoverMessage).to.equal('Adds DI bindings for the module');

        // Second & third: hunk decorations with hunk-specific comments
        expect(decorations[1].options.hoverMessage).to.equal('Import changes');
        expect(decorations[2].options.hoverMessage).to.equal('Service bindings');
    });

    it('should NOT add file-comment marker when file has comment but NO hunk comments', () => {
        const review = makeReview([
            makeArea('a1', 'Area 1', 'Area description', [
                makeAreaFile('src/module.ts',
                    [Range.create(10, 0, 20, 0), Range.create(50, 0, 60, 0)],
                    [{ hunkId: 'hunk-1' }, { hunkId: 'hunk-2' }],
                    'File-level comment',
                ),
            ]),
        ]);

        const decorations = decorator.testBuildDecorations(review);

        // No file-level marker — file comment already appears on every hunk decoration
        expect(decorations).to.have.length(2);
        expect(decorations[0].options.hoverMessage).to.equal('File-level comment');
        expect(decorations[1].options.hoverMessage).to.equal('File-level comment');
    });

    it('should NOT add file-comment marker when file has no comment', () => {
        const review = makeReview([
            makeArea('a1', 'Area 1', 'Area description', [
                makeAreaFile('src/module.ts',
                    [Range.create(10, 0, 20, 0)],
                    [{ hunkId: 'hunk-1', comment: 'Hunk comment' }],
                ),
            ]),
        ]);

        const decorations = decorator.testBuildDecorations(review);

        // No file-level marker — file has no comment
        expect(decorations).to.have.length(1);
        expect(decorations[0].options.hoverMessage).to.equal('Hunk comment');
    });

    it('should show decorations for multiple areas touching the same file', () => {
        const review = makeReview([
            makeArea('a1', 'Area 1', 'Area 1 description', [
                makeAreaFile('src/module.ts',
                    [Range.create(10, 0, 20, 0)],
                    [{ hunkId: 'hunk-1', comment: 'Area 1 hunk comment' }],
                ),
            ]),
            makeArea('a2', 'Area 2', 'Area 2 description', [
                makeAreaFile('src/module.ts',
                    [Range.create(50, 0, 60, 0)],
                    [{ hunkId: 'hunk-2', comment: 'Area 2 hunk comment' }],
                ),
            ]),
        ]);

        const decorations = decorator.testBuildDecorations(review);

        expect(decorations).to.have.length(2);

        // Different area labels in glyph margin hover
        expect(decorations[0].options.glyphMarginHoverMessage).to.include('**Area 1**');
        expect(decorations[0].options.hoverMessage).to.equal('Area 1 hunk comment');

        expect(decorations[1].options.glyphMarginHoverMessage).to.include('**Area 2**');
        expect(decorations[1].options.hoverMessage).to.equal('Area 2 hunk comment');

        // Different color classes (area index 0 vs 1)
        expect(decorations[0].options.glyphMarginClassName).to.include('ai-review-area-color-0');
        expect(decorations[1].options.glyphMarginClassName).to.include('ai-review-area-color-1');
    });

    it('should return empty decorations when no file matches', () => {
        const review = makeReview([
            makeArea('a1', 'Area 1', 'Area description', [
                makeAreaFile('src/other-file.ts',
                    [Range.create(10, 0, 20, 0)],
                    [{ hunkId: 'hunk-1' }],
                ),
            ]),
        ]);

        const decorations = decorator.testBuildDecorations(review);

        expect(decorations).to.be.empty;
    });

    it('should handle mixed hunks — some with comments, some without — and add file marker', () => {
        const review = makeReview([
            makeArea('a1', 'Area 1', 'Area description', [
                makeAreaFile('src/module.ts',
                    [Range.create(10, 0, 20, 0), Range.create(50, 0, 60, 0)],
                    [
                        { hunkId: 'hunk-1', comment: 'Has a comment' },
                        { hunkId: 'hunk-2' },
                    ],
                    'File comment',
                ),
            ]),
        ]);

        const decorations = decorator.testBuildDecorations(review);

        // 1 file-marker + 2 hunk decorations = 3 (because at least one hunk has a comment)
        expect(decorations).to.have.length(3);
        expect(decorations[0].options.hoverMessage).to.equal('File comment');
        expect(decorations[1].options.hoverMessage).to.equal('Has a comment');
        // Second hunk has no comment, falls back to file comment
        expect(decorations[2].options.hoverMessage).to.equal('File comment');
    });
});
