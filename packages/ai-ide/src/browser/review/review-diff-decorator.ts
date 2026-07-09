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

import { DisposableCollection, Emitter } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { EditorDecoration, EditorDecorationOptions, EditorManager, TextEditor, TrackedRangeStickiness } from '@theia/editor/lib/browser';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import URI from '@theia/core/lib/common/uri';
import { ReviewResult, ReviewArea } from './review-model';

const AREA_COLORS = [
    'ai-review-area-color-0',
    'ai-review-area-color-1',
    'ai-review-area-color-2',
    'ai-review-area-color-3',
    'ai-review-area-color-4',
    'ai-review-area-color-5',
];

@injectable()
export class ReviewDiffDecorator {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected readonly appliedDecorations = new Map<string, string[]>();
    protected activeReview?: ReviewResult;
    protected activeModifiedUri?: URI;

    protected readonly onDidClickAreaEmitter = new Emitter<{ reviewId: string; areaId: string }>();
    readonly onDidClickArea = this.onDidClickAreaEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidClickAreaEmitter);

    @postConstruct()
    protected init(): void {
        this.toDispose.push(
            this.editorManager.onCreated(editorWidget => {
                const editor = editorWidget.editor;
                if (this.activeReview && this.isMatchingEditor(editor)) {
                    this.applyDecorations(editor, this.activeReview);
                }
            })
        );
    }

    setActiveReview(review: ReviewResult, modifiedUri: URI): void {
        this.activeReview = review;
        this.activeModifiedUri = modifiedUri;

        for (const editorWidget of this.editorManager.all) {
            const editor = editorWidget.editor;
            if (this.isMatchingEditor(editor)) {
                this.applyDecorations(editor, review);
            }
        }
    }

    clearDecorations(): void {
        this.activeReview = undefined;
        this.activeModifiedUri = undefined;
        for (const [uri, oldIds] of this.appliedDecorations) {
            for (const editorWidget of this.editorManager.all) {
                const editor = editorWidget.editor;
                if (editor.uri.toString() === uri) {
                    editor.deltaDecorations({ oldDecorations: oldIds, newDecorations: [] });
                }
            }
        }
        this.appliedDecorations.clear();
    }

    protected isMatchingEditor(editor: TextEditor): boolean {
        if (!this.activeModifiedUri) {
            return false;
        }
        const editorUri = editor.uri;
        if (DiffUris.isDiffUri(editorUri)) {
            try {
                const [, rightUri] = DiffUris.decode(editorUri);
                return rightUri.toString() === this.activeModifiedUri.toString();
            } catch {
                return false;
            }
        }
        return editorUri.toString() === this.activeModifiedUri.toString();
    }

    protected applyDecorations(editor: TextEditor, review: ReviewResult): void {
        const decorations: EditorDecoration[] = [];
        const filePath = this.activeModifiedUri?.path.toString() ?? '';

        review.areas.forEach((area, areaIndex) => {
            const colorClass = AREA_COLORS[areaIndex % AREA_COLORS.length];
            const matchingFiles = area.files.filter(f => filePath.endsWith(f.path));
            for (const areaFile of matchingFiles) {
                for (const range of areaFile.ranges) {
                    const decoration = this.createAreaDecoration(area, colorClass, range);
                    decorations.push(decoration);
                }
            }
        });

        const uri = editor.uri.toString();
        const oldDecorations = this.appliedDecorations.get(uri) ?? [];
        const newIds = editor.deltaDecorations({ oldDecorations, newDecorations: decorations });
        this.appliedDecorations.set(uri, newIds);
    }

    protected createAreaDecoration(
        area: ReviewArea,
        colorClass: string,
        range: import('@theia/core/shared/vscode-languageserver-protocol').Range
    ): EditorDecoration {
        const options: EditorDecorationOptions = {
            blockClassName: `ai-review-block ${colorClass}`,
            blockPadding: [2, 4, 2, 4],
            glyphMarginClassName: `ai-review-glyph ${colorClass}`,
            glyphMarginHoverMessage: `**${area.label}**\n\n${area.description}`,
            hoverMessage: area.description,
            isWholeLine: true,
            stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        };
        return { range, options };
    }
}
