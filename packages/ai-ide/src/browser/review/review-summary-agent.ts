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
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ReviewArea, ReviewChangeSet, ReviewResult } from './review-model';
import { REVIEW_SUMMARY_PROMPT_ID, reviewSummaryPromptTemplate } from './review-summary-prompt-template';

@injectable()
export class ReviewSummaryService {

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    async reviewChangeSet(cs: ReviewChangeSet): Promise<ReviewResult> {
        const diffs = await this.collectDiffs(cs);
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

    protected async collectDiffs(cs: ReviewChangeSet): Promise<string> {
        const parts: string[] = [];
        for (const file of cs.files) {
            parts.push(`## ${file.uri.path.base} (${file.status})`);
            if (file.modifiedUri) {
                try {
                    const content = await this.fileService.read(file.modifiedUri);
                    parts.push('```');
                    parts.push(content.value);
                    parts.push('```');
                } catch {
                    parts.push('(unable to read file content)');
                }
            }
        }
        return parts.join('\n');
    }

    protected buildPrompt(cs: ReviewChangeSet, diffs: string): { systemMessage: string; userMessage: string } {
        const systemMessage = `You are a code review assistant. You analyze change sets and produce structured reviews.

    Respond with a JSON object (no markdown fences) with this structure:
    {
    "summary": "A high-level summary of all changes",
    "areas": [
    {
      "id": "area-1",
      "label": "Short area name",
      "description": "Description of what this logical group of changes does",
      "files": [
        {
          "path": "relative/path/to/file",
          "ranges": [{"start": {"line": 1, "character": 0}, "end": {"line": 10, "character": 0}}]
        }
      ]
    }
    ]
    }`;

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
            const areas: ReviewArea[] = (parsed.areas ?? []).map((a: ReviewArea, i: number) => ({
                id: a.id ?? `area-${i + 1}`,
                label: a.label ?? `Area ${i + 1}`,
                description: a.description ?? '',
                files: a.files ?? [],
            }));
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
}
