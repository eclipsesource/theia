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

import { LanguageModelRegistry, LanguageModelResponse, PromptService, UserRequest, isLanguageModelStreamResponse } from '@theia/ai-core/lib/common';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { ILogger } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { DiffHunk, HunkRef, ReviewArea, ReviewAreaFile, ReviewChangeSet, ReviewResult } from './review-model';
import { REVIEW_SUMMARY_PROMPT_ID, reviewSummaryPromptTemplate } from './review-summary-prompt-template';

@injectable()
export class ReviewSummaryService {

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    async reviewChangeSet(cs: ReviewChangeSet): Promise<ReviewResult> {
        const diffs = this.collectDiffs(cs);
        const model = await this.languageModelRegistry.selectLanguageModel({ agent: 'review-summary', purpose: 'chat', identifier: 'default/code' });
        if (!model) {
            throw new Error('No language model available for review summarization.');
        }

        this.promptService.addBuiltInPromptFragment({
            id: REVIEW_SUMMARY_PROMPT_ID,
            template: reviewSummaryPromptTemplate.template,
        });

        const { systemMessage, userMessage } = this.buildPrompt(cs, diffs);
        const sessionId = generateUuid();
        const requestId = generateUuid();
        const request: UserRequest = {
            sessionId,
            requestId,
            messages: [
                { type: 'text', actor: 'system', text: systemMessage },
                { type: 'text', actor: 'user', text: userMessage },
            ],
        };

        const response: LanguageModelResponse = await model.request(request);
        const text = await this.responseToText(response);
        return this.parseResponse(cs, text);
    }

    protected collectDiffs(cs: ReviewChangeSet): string {
        const parts: string[] = [];
        for (const file of cs.files) {
            const relativePath = file.uri.path.toString();
            parts.push(`## file: ${relativePath} (${file.status})`);

            const hunks = file.hunks ?? [];
            if (hunks.length === 0) {
                parts.push('(no diff hunks available)');
                parts.push('');
                continue;
            }

            for (const hunk of hunks) {
                const startLine = hunk.modifiedRange.start.line;
                const endLine = hunk.modifiedRange.end.line;
                parts.push(`### ${hunk.id} (lines ${startLine}-${endLine} in modified file)`);
                parts.push(`Type: ${hunk.type}`);
                parts.push('```diff');
                parts.push(hunk.content);
                parts.push('```');
                parts.push('');
            }
        }
        return parts.join('\n');
    }

    protected buildPrompt(cs: ReviewChangeSet, diffs: string): { systemMessage: string; userMessage: string } {
        const systemMessage = reviewSummaryPromptTemplate.template;

        const userMessage = `Analyze the following change set and produce a structured review.

Change set: "${cs.label}" (source: ${cs.source})
Files changed: ${cs.files.length}

${diffs}`;

        return { systemMessage, userMessage };
    }

    protected async responseToText(response: LanguageModelResponse): Promise<string> {
        if (isLanguageModelStreamResponse(response)) {
            const parts: string[] = [];
            for await (const chunk of response.stream) {
                if ('content' in chunk) {
                    parts.push(chunk.content);
                }
            }
            return parts.join('');
        }
        if ('text' in response) {
            return response.text;
        }
        return '';
    }

    protected parseResponse(cs: ReviewChangeSet, text: string): ReviewResult {
        const id = `review-${cs.id}-${Date.now()}`;
        try {
            const cleaned = text.replace(/^```json?\s*/m, '').replace(/\s*```$/m, '').trim();
            const parsed = JSON.parse(cleaned);
            const areas: ReviewArea[] = (parsed.areas ?? []).map((a: RawArea, i: number) => {
                const files: ReviewAreaFile[] = (a.files ?? []).map((f: RawAreaFile) => ({
                    path: f.path ?? '',
                    hunkRefs: (f.hunkRefs ?? []).map((ref: RawHunkRef) => ({
                        hunkId: ref.hunkId,
                        startLine: ref.startLine,
                        endLine: ref.endLine,
                    })),
                    ranges: [],
                }));
                return {
                    id: a.id ?? `area-${i + 1}`,
                    label: a.label ?? `Area ${i + 1}`,
                    description: a.description ?? '',
                    files,
                };
            });
            this.resolveHunkRanges(areas, cs);
            return {
                id,
                changeSetId: cs.id,
                timestamp: new Date().toISOString(),
                summary: parsed.summary ?? text,
                areas,
            };
        } catch {
            return {
                id,
                changeSetId: cs.id,
                timestamp: new Date().toISOString(),
                summary: text,
                areas: [],
            };
        }
    }

    resolveHunkRanges(areas: ReviewArea[], cs: ReviewChangeSet): void {
        const hunkMap = new Map<string, Map<string, DiffHunk>>();
        for (const file of cs.files) {
            const fileHunks = new Map<string, DiffHunk>();
            for (const hunk of file.hunks ?? []) {
                fileHunks.set(hunk.id, hunk);
            }
            hunkMap.set(file.uri.path.toString(), fileHunks);
        }

        for (const area of areas) {
            for (const areaFile of area.files) {
                const fileHunks = this.findFileHunks(hunkMap, areaFile.path);
                areaFile.ranges = (areaFile.hunkRefs ?? [])
                    .map(ref => this.resolveRef(ref, fileHunks))
                    .filter((r): r is Range => r !== undefined);
            }
        }
    }

    protected findFileHunks(hunkMap: Map<string, Map<string, DiffHunk>>, path: string): Map<string, DiffHunk> | undefined {
        for (const [filePath, hunks] of hunkMap) {
            if (filePath.endsWith(path) || path.endsWith(filePath)) {
                return hunks;
            }
        }
        return undefined;
    }

    resolveRef(ref: HunkRef, fileHunks?: Map<string, DiffHunk>): Range | undefined {
        const hunk = fileHunks?.get(ref.hunkId);
        if (!hunk) {
            this.logger.warn(`Unknown hunk ID "${ref.hunkId}" in AI review response — ignoring.`);
            return undefined;
        }

        if (ref.startLine === undefined || ref.endLine === undefined) {
            return hunk.modifiedRange;
        }

        const hunkStart = hunk.modifiedRange.start.line;
        const hunkEnd = hunk.modifiedRange.end.line;
        const clampedStart = Math.max(ref.startLine, hunkStart);
        const clampedEnd = Math.min(ref.endLine, hunkEnd);

        if (clampedStart > clampedEnd) {
            this.logger.warn(
                `Sub-range [${ref.startLine}-${ref.endLine}] in hunk "${ref.hunkId}" ` +
                `falls outside hunk bounds [${hunkStart}-${hunkEnd}] — using full hunk.`
            );
            return hunk.modifiedRange;
        }

        return Range.create(clampedStart, 0, clampedEnd, 0);
    }
}

interface RawHunkRef {
    hunkId: string;
    startLine?: number;
    endLine?: number;
}

interface RawAreaFile {
    path?: string;
    hunkRefs?: RawHunkRef[];
}

interface RawArea {
    id?: string;
    label?: string;
    description?: string;
    files?: RawAreaFile[];
}
