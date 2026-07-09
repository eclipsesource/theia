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

import { Emitter, ILogger, nls } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { codicon, open, OpenerService, ReactWidget } from '@theia/core/lib/browser';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReviewArea, ReviewAreaDisposition, ReviewChangeSet, ReviewFileChange, ReviewResult } from './review-model';
import { ReviewChangeSetService } from './review-changeset-service';
import { ReviewStorageService } from './review-storage-service';
import { ReviewSummaryService } from './review-summary-agent';
import { ReviewDiffDecorator } from './review-diff-decorator';

@injectable()
export class AIReviewWidget extends ReactWidget {

    static readonly ID = 'ai-review-widget';
    static readonly LABEL = nls.localize('theia/ai-ide/reviewView', 'AI Review');

    @inject(ReviewChangeSetService)
    protected readonly changeSetService: ReviewChangeSetService;

    @inject(ReviewStorageService)
    protected readonly storageService: ReviewStorageService;

    @inject(ReviewSummaryService)
    protected readonly summaryService: ReviewSummaryService;

    @inject(ReviewDiffDecorator)
    protected readonly diffDecorator: ReviewDiffDecorator;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected changeSets: ReviewChangeSet[] = [];
    protected loading = false;
    protected expandedSets = new Set<string>();

    protected readonly onDidSelectAreaEmitter = new Emitter<{ reviewId: string; areaId: string }>();
    readonly onDidSelectArea = this.onDidSelectAreaEmitter.event;

    @postConstruct()
    protected init(): void {
        this.id = AIReviewWidget.ID;
        this.title.label = AIReviewWidget.LABEL;
        this.title.caption = AIReviewWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = codicon('checklist');
        this.addClass('ai-review-view');

        this.toDispose.pushAll([
            this.changeSetService.onDidChange(() => this.refreshChangeSets()),
            this.storageService.onDidChange(() => this.update()),
            this.onDidSelectAreaEmitter,
        ]);

        this.refreshChangeSets();
    }

    async refreshChangeSets(): Promise<void> {
        this.changeSets = await this.changeSetService.getChangeSets();
        this.update();
    }

    async reReviewAll(): Promise<void> {
        await this.refreshChangeSets();
        for (const cs of this.changeSets) {
            const existing = this.storageService.getByChangeSetId(cs.id);
            if (existing) {
                await this.triggerReview(cs);
            }
        }
    }

    highlightArea(reviewId: string, areaId: string): void {
        this.onDidSelectAreaEmitter.fire({ reviewId, areaId });
        this.update();
    }

    protected render(): React.ReactNode {
        if (this.changeSets.length === 0) {
            return this.renderEmpty();
        }
        return (
            <div className='ai-review-view-content'>
                {this.changeSets.map(cs => this.renderChangeSet(cs))}
            </div>
        );
    }

    protected renderEmpty(): React.ReactNode {
        return (
            <div className='ai-review-view-empty'>
                <span className={codicon('checklist')} />
                <p>{nls.localize('theia/ai-ide/noChanges', 'No changes to review.')}</p>
            </div>
        );
    }

    protected renderChangeSet(cs: ReviewChangeSet): React.ReactNode {
        const review = this.storageService.getByChangeSetId(cs.id);
        const isExpanded = this.expandedSets.has(cs.id);
        return (
            <div key={cs.id} className='ai-review-changeset'>
                <div className='ai-review-changeset-header' onClick={() => this.toggleExpand(cs.id)}>
                    <span className={codicon(isExpanded ? 'chevron-down' : 'chevron-right')} />
                    <span className='ai-review-changeset-label'>{cs.label}</span>
                    <span className='ai-review-changeset-badge'>{cs.files.length} {cs.files.length === 1 ? 'file' : 'files'}</span>
                    <button
                        className='theia-button ai-review-button'
                        onClick={e => { e.stopPropagation(); this.triggerReview(cs); }}
                        disabled={this.loading}
                    >
                        {this.loading
                            ? nls.localize('theia/ai-ide/reviewing', 'Reviewing...')
                            : review
                                ? nls.localize('theia/ai-ide/reReview', 'Re-review')
                                : nls.localizeByDefault('Review')}
                    </button>
                </div>
                {isExpanded && (
                    <div className='ai-review-changeset-body'>
                        {review && this.renderReviewResult(review)}
                        {this.renderFileList(cs)}
                    </div>
                )}
            </div>
        );
    }

    protected renderReviewResult(review: ReviewResult): React.ReactNode {
        return (
            <div className='ai-review-result'>
                <div className='ai-review-summary'>
                    <span className={codicon('comment-discussion')} />
                    <span>{review.summary}</span>
                </div>
                {review.areas.map(area => this.renderArea(review.id, area))}
            </div>
        );
    }

    protected renderArea(reviewId: string, area: ReviewArea): React.ReactNode {
        return (
            <div key={area.id} className={`ai-review-area ${area.disposition ? `disposition-${area.disposition}` : ''}`}>
                <div className='ai-review-area-header'>
                    <span className='ai-review-area-label'>{area.label}</span>
                    {area.disposition && (
                        <span className={`ai-review-area-disposition ${area.disposition}`}>
                            {area.disposition}
                        </span>
                    )}
                </div>
                <div className='ai-review-area-description'>{area.description}</div>
                <div className='ai-review-area-files'>
                    {area.files.map(f => (
                        <span
                            key={f.path}
                            className='ai-review-area-file-link'
                            title={f.path}
                            onClick={() => this.openAreaFile(reviewId, area, f.path)}
                        >
                            {f.path.split('/').pop()}
                        </span>
                    ))}
                </div>
                <div className='ai-review-area-actions'>
                    {this.renderDispositionButton(reviewId, area, 'reviewed', nls.localize('theia/ai-ide/reviewed', 'Reviewed'))}
                    {this.renderDispositionButton(reviewId, area, 'needs-work', nls.localize('theia/ai-ide/needsWork', 'Needs Work'))}
                    {this.renderDispositionButton(reviewId, area, 'dismissed', nls.localize('theia/ai-ide/dismissed', 'Dismissed'))}
                </div>
            </div>
        );
    }

    protected renderDispositionButton(reviewId: string, area: ReviewArea, disposition: ReviewAreaDisposition, label: string): React.ReactNode {
        const isActive = area.disposition === disposition;
        return (
            <button
                className={`theia-button ai-review-disposition-btn ${isActive ? 'active' : ''}`}
                onClick={() => this.setDisposition(reviewId, area.id, disposition)}
            >
                {label}
            </button>
        );
    }

    protected renderFileList(cs: ReviewChangeSet): React.ReactNode {
        return (
            <div className='ai-review-file-list'>
                {cs.files.map(file => this.renderFileItem(file))}
            </div>
        );
    }

    protected renderFileItem(file: ReviewFileChange): React.ReactNode {
        const icon = this.getStatusIcon(file.status);
        const label = file.uri.path.base;
        const path = file.uri.path.toString();
        return (
            <div
                key={path}
                className='ai-review-file-item'
                onClick={() => this.openFileDiff(file)}
            >
                <span className={`ai-review-file-status ${file.status}`}>{icon}</span>
                <span className='ai-review-file-name'>{label}</span>
                <span className='ai-review-file-path'>{file.uri.parent.path.toString()}</span>
            </div>
        );
    }

    protected getStatusIcon(status: string): string {
        switch (status) {
            case 'added': return 'A';
            case 'deleted': return 'D';
            case 'renamed': return 'R';
            default: return 'M';
        }
    }

    protected toggleExpand(id: string): void {
        if (this.expandedSets.has(id)) {
            this.expandedSets.delete(id);
        } else {
            this.expandedSets.add(id);
        }
        this.update();
    }

    protected async triggerReview(cs: ReviewChangeSet): Promise<void> {
        this.loading = true;
        this.update();
        try {
            const existing = this.storageService.getByChangeSetId(cs.id);
            if (existing) {
                this.diffDecorator.clearDecorations();
                await this.storageService.delete(existing.id);
            }

            const result = await this.summaryService.reviewChangeSet(cs);
            await this.storageService.store(result);
            this.expandedSets.add(cs.id);
        } catch (error) {
            this.logger.error('Failed to generate review:', error);
        } finally {
            this.loading = false;
            this.update();
        }
    }

    protected async openFileDiff(file: ReviewFileChange): Promise<void> {
        try {
            if (file.originalUri && file.modifiedUri) {
                await this.openDiffOrFallback(file.originalUri, file.modifiedUri, file.uri);
            } else {
                const uri = file.modifiedUri ?? file.originalUri ?? file.uri;
                await open(this.openerService, uri);
            }
        } catch (error) {
            this.logger.error(`Failed to open diff for ${file.uri.path.base}:`, error);
        }
    }

    protected async openAreaFile(reviewId: string, area: ReviewArea, filePath: string): Promise<void> {
        try {
            const review = this.storageService.get(reviewId);
            if (!review) {
                this.logger.warn(`Cannot open area file: review '${reviewId}' not found in storage.`);
                return;
            }

            const cs = this.changeSets.find(c => c.id === review.changeSetId);
            if (!cs) {
                this.logger.warn(`Cannot open area file: change set '${review.changeSetId}' not found. Available: [${this.changeSets.map(c => c.id).join(', ')}]`);
                return;
            }

            const file = this.findMatchingFile(cs, filePath);
            if (!file) {
                this.logger.warn(`Cannot open area file: no file matching '${filePath}' in change set. Available: [${cs.files.map(f => f.uri.path.toString()).join(', ')}]`);
                return;
            }

            if (file.originalUri && file.modifiedUri) {
                const areaFile = area.files.find(f => f.path === filePath);
                const selection = areaFile?.ranges?.[0];
                await this.openDiffOrFallback(file.originalUri, file.modifiedUri, file.uri, { selection });
                this.diffDecorator.setActiveReview(review, file.modifiedUri);
            } else {
                const uri = file.modifiedUri ?? file.originalUri ?? file.uri;
                await open(this.openerService, uri);
                this.diffDecorator.setActiveReview(review, uri);
            }
        } catch (error) {
            this.logger.error(`Failed to open area file '${filePath}':`, error);
        }
    }

    protected async openDiffOrFallback(originalUri: URI, modifiedUri: URI, fileUri: URI, options?: object): Promise<void> {
        const diffUri = DiffUris.encode(originalUri, modifiedUri, fileUri.path.base);
        try {
            await open(this.openerService, diffUri, options);
        } catch (diffError) {
            this.logger.warn(`Diff open failed for ${fileUri.path.base}, falling back to single file view:`, diffError);
            const fallbackUri = modifiedUri ?? originalUri ?? fileUri;
            await open(this.openerService, fallbackUri, options);
        }
    }

    protected findMatchingFile(cs: ReviewChangeSet, filePath: string): ReviewFileChange | undefined {
        // Normalize path separators for comparison
        const normalizedPath = filePath.replace(/\\/g, '/');

        // Try exact match on the full path
        const exactMatch = cs.files.find(f => f.uri.path.toString() === normalizedPath);
        if (exactMatch) {
            return exactMatch;
        }

        // Try suffix match (AI may return relative paths like 'src/foo.ts')
        const suffixMatch = cs.files.find(f => f.uri.path.toString().endsWith('/' + normalizedPath) || f.uri.path.toString().endsWith(normalizedPath));
        if (suffixMatch) {
            return suffixMatch;
        }

        // Try basename-only match as last resort
        const baseName = normalizedPath.split('/').pop() ?? normalizedPath;
        const baseMatch = cs.files.find(f => f.uri.path.base === baseName);
        return baseMatch;
    }

    protected async setDisposition(reviewId: string, areaId: string, disposition: ReviewAreaDisposition): Promise<void> {
        await this.storageService.updateDisposition(reviewId, areaId, disposition);
        this.update();
    }
}
