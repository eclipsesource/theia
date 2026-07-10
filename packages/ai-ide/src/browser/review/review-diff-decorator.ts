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

import { DisposableCollection, Emitter, ILogger } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { EditorDecoration, EditorDecorationOptions, EditorManager, TextEditor, TrackedRangeStickiness } from '@theia/editor/lib/browser';
import { MonacoDiffEditor } from '@theia/monaco/lib/browser/monaco-diff-editor';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import URI from '@theia/core/lib/common/uri';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
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

    @inject(ILogger)
    protected readonly logger: ILogger;

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
                if (this.activeReview && this.isMatchingEditor(editorWidget.editor)) {
                    this.applyDecorationsToWidget(editorWidget.editor, this.activeReview);
                }
            })
        );
    }

    setActiveReview(review: ReviewResult, modifiedUri: URI): void {
        this.activeReview = review;
        this.activeModifiedUri = modifiedUri;

        for (const editorWidget of this.editorManager.all) {
            if (this.isMatchingEditor(editorWidget.editor)) {
                this.applyDecorationsToWidget(editorWidget.editor, review);
            }
        }
    }

    clearDecorations(): void {
        this.activeReview = undefined;
        this.activeModifiedUri = undefined;
        for (const [key, oldIds] of this.appliedDecorations) {
            for (const editorWidget of this.editorManager.all) {
                const target = this.getDecorationTarget(editorWidget.editor);
                if (target && this.decorationKey(target) === key) {
                    target.deltaDecorations({ oldDecorations: oldIds, newDecorations: [] });
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

    /**
     * For diff editors, returns the modified sub-editor (which supports deltaDecorations).
     * For regular editors, returns the editor itself.
     */
    protected getDecorationTarget(editor: TextEditor): TextEditor | undefined {
        if (editor instanceof MonacoDiffEditor) {
            // MonacoDiffEditor.deltaDecorations is a no-op.
            // The modified side is exposed as `this.editor` internally,
            // but we can access it through the public diffEditor API.
            // MonacoEditor (the parent class) wraps the modified editor's
            // code editor, but deltaDecorations is overridden to warn.
            // We need to get the modified MonacoEditor directly.
            // MonacoDiffEditor sets `this.editor = this._diffEditor.getModifiedEditor()`
            // in create(), so the underlying code editor IS the modified one,
            // but the overridden deltaDecorations blocks it.
            // We can use the modifiedModel's uri to find the underlying editor.
            return undefined;
        }
        return editor;
    }

    protected applyDecorationsToWidget(editor: TextEditor, review: ReviewResult): void {
        const decorations = this.buildDecorations(review);
        if (decorations.length === 0) {
            return;
        }

        if (editor instanceof MonacoDiffEditor) {
            // Apply decorations directly to the modified side's monaco code editor,
            // bypassing MonacoDiffEditor's no-op deltaDecorations override.
            this.applyToMonacoDiffEditor(editor, decorations);
        } else {
            this.applyToEditor(editor, decorations);
        }
    }

    protected buildDecorations(review: ReviewResult): EditorDecoration[] {
        const decorations: EditorDecoration[] = [];
        const filePath = this.activeModifiedUri?.path.toString() ?? '';

        review.areas.forEach((area, areaIndex) => {
            const colorClass = AREA_COLORS[areaIndex % AREA_COLORS.length];
            const matchingFiles = area.files.filter(f => filePath.endsWith(f.path));
            for (const areaFile of matchingFiles) {
                const hasHunkComments = areaFile.hunkRefs.some(ref => ref.comment);

                // If the file has its own comment AND hunks have their own comments,
                // add a file-level marker on line 1 so the file comment is visible
                if (areaFile.comment && hasHunkComments) {
                    const fileRange = Range.create(0, 0, 0, 0);
                    decorations.push(this.createAreaDecoration(area, colorClass, fileRange, areaFile.comment));
                }

                for (let rangeIndex = 0; rangeIndex < areaFile.ranges.length; rangeIndex++) {
                    const range = areaFile.ranges[rangeIndex];
                    const hunkRef = areaFile.hunkRefs[rangeIndex];
                    const comment = hunkRef?.comment ?? areaFile.comment ?? area.description;
                    decorations.push(this.createAreaDecoration(area, colorClass, range, comment));
                }
            }
        });

        return decorations;
    }

    protected applyToEditor(editor: TextEditor, decorations: EditorDecoration[]): void {
        const key = this.decorationKey(editor);
        const oldDecorations = this.appliedDecorations.get(key) ?? [];
        const newIds = editor.deltaDecorations({ oldDecorations, newDecorations: decorations });
        this.appliedDecorations.set(key, newIds);
    }

    protected applyToMonacoDiffEditor(diffEditor: MonacoDiffEditor, decorations: EditorDecoration[]): void {
        const monacoEditor = diffEditor.diffEditor.getModifiedEditor();
        const key = `diff-modified:${this.activeModifiedUri?.toString() ?? ''}`;
        const oldDecorations = this.appliedDecorations.get(key) ?? [];

        const monacoDecorations = decorations.map(d => ({
            range: {
                startLineNumber: d.range.start.line + 1,
                startColumn: d.range.start.character + 1,
                endLineNumber: d.range.end.line + 1,
                endColumn: d.range.end.character + 1,
            },
            options: {
                ...d.options,
                hoverMessage: typeof d.options.hoverMessage === 'string' ? { value: d.options.hoverMessage } : d.options.hoverMessage,
                glyphMarginHoverMessage: typeof d.options.glyphMarginHoverMessage === 'string'
                    ? { value: d.options.glyphMarginHoverMessage }
                    : d.options.glyphMarginHoverMessage,
            },
        }));

        const newIds = monacoEditor.deltaDecorations(oldDecorations, monacoDecorations);
        this.appliedDecorations.set(key, newIds);
    }

    protected decorationKey(editor: TextEditor): string {
        return editor.uri.toString();
    }

    protected createAreaDecoration(
        area: ReviewArea,
        colorClass: string,
        range: Range,
        comment: string
    ): EditorDecoration {
        const options: EditorDecorationOptions = {
            blockClassName: `ai-review-block ${colorClass}`,
            blockPadding: [2, 4, 2, 4],
            glyphMarginClassName: `ai-review-glyph ${colorClass}`,
            glyphMarginHoverMessage: `**${area.label}**\n\n${comment}`,
            hoverMessage: comment,
            isWholeLine: true,
            stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        };
        return { range, options };
    }
}
