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

import { DisposableCollection, Emitter, ILogger, Path, PreferenceService, URI } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileChangeType } from '@theia/filesystem/lib/common/files';
import { ReviewArea, ReviewAreaDisposition, ReviewResult } from './review-model';
import * as yaml from 'js-yaml';

const REVIEW_STORAGE_DIRECTORY_PREF = 'ai-features.review.storageDirectory';
const REVIEW_STORAGE_DEFAULT_DIR = '.prompts/reviews';

@injectable()
export class ReviewStorageService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected readonly reviews = new Map<string, ReviewResult>();
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        await Promise.all([this.workspaceService.ready, this.preferenceService.ready]);
        await this.watchStorage();
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === REVIEW_STORAGE_DIRECTORY_PREF) {
                this.watchStorage().catch(error => this.logger.error(error));
            }
        });
    }

    protected toDisposeOnStorageChange?: DisposableCollection;

    protected async watchStorage(): Promise<void> {
        const storageUri = this.getStorageLocation();
        this.toDisposeOnStorageChange?.dispose();
        this.toDisposeOnStorageChange = undefined;
        if (!storageUri) {
            return;
        }
        this.toDisposeOnStorageChange = new DisposableCollection(
            this.fileService.watch(storageUri, { recursive: true, excludes: [] }),
            this.fileService.onDidFilesChange(event => {
                const relevant = event.changes.filter(c => storageUri.isEqualOrParent(c.resource));
                if (relevant.length > 0) {
                    for (const change of relevant) {
                        if (change.type === FileChangeType.DELETED) {
                            this.deleteByUri(change.resource);
                        }
                    }
                    this.loadAll().catch(err => this.logger.error(err));
                }
            }),
            { dispose: () => this.reviews.clear() }
        );
        await this.loadAll();
    }

    protected getStorageLocation(): URI | undefined {
        if (!this.workspaceService.opened) {
            return undefined;
        }
        const values = this.preferenceService.inspect(REVIEW_STORAGE_DIRECTORY_PREF);
        const configuredPath = values?.globalValue ?? values?.defaultValue ?? REVIEW_STORAGE_DEFAULT_DIR;
        if (!configuredPath || typeof configuredPath !== 'string') {
            return undefined;
        }
        const asPath = new Path(configuredPath);
        return asPath.isAbsolute
            ? new URI(configuredPath)
            : this.workspaceService.tryGetRoots().at(0)?.resource.resolve(configuredPath);
    }

    protected async loadAll(): Promise<void> {
        const storageUri = this.getStorageLocation();
        if (!storageUri) {
            return;
        }
        try {
            const contents = await this.fileService.resolve(storageUri);
            if (contents.children) {
                for (const child of contents.children) {
                    if (child.resource.path.ext === '.md') {
                        await this.readFile(child.resource);
                    }
                }
            }
        } catch {
            // directory may not exist yet
        }
        this.onDidChangeEmitter.fire();
    }

    protected async readFile(uri: URI): Promise<void> {
        try {
            const content = await this.fileService.read(uri).then(r => r.value);
            const review = this.parseReview(content);
            if (review) {
                this.reviews.set(review.id, review);
            }
        } catch (error) {
            this.logger.error(`Failed to read review file ${uri}: ${error}`);
        }
    }

    protected parseReview(content: string): ReviewResult | undefined {
        const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
        if (!fmMatch) {
            return undefined;
        }
        try {
            const frontmatter = yaml.load(fmMatch[1]) as Record<string, unknown>;
            if (!frontmatter || typeof frontmatter !== 'object' || !frontmatter.id) {
                return undefined;
            }
            return {
                id: String(frontmatter.id),
                changeSetId: String(frontmatter.changeSetId ?? ''),
                timestamp: String(frontmatter.timestamp ?? ''),
                summary: fmMatch[2].trim(),
                areas: Array.isArray(frontmatter.areas)
                    ? (frontmatter.areas as ReviewArea[])
                    : [],
            };
        } catch {
            return undefined;
        }
    }

    protected serializeReview(review: ReviewResult): string {
        const frontmatter = {
            id: review.id,
            changeSetId: review.changeSetId,
            timestamp: review.timestamp,
            areas: review.areas,
        };
        return `---\n${yaml.dump(frontmatter).trim()}\n---\n${review.summary}`;
    }

    protected deleteByUri(uri: URI): void {
        for (const [id, _review] of this.reviews) {
            const filename = this.reviewFilename(id);
            if (uri.path.base === filename) {
                this.reviews.delete(id);
                break;
            }
        }
    }

    protected reviewFilename(id: string): string {
        const sanitized = id.replace(/[^\p{L}\p{N}]/ug, '-').replace(/^-+|-+$/g, '');
        const truncated = sanitized.length > 32 ? sanitized.slice(0, sanitized.indexOf('-', 32) || 32) : sanitized;
        return `${truncated}.md`;
    }

    async store(review: ReviewResult): Promise<void> {
        // Remove other reviews for the same change set (enforces 1:1),
        // but skip the review being stored (avoids delete/recreate on update)
        await this.deleteOtherReviewsForChangeSet(review.changeSetId, review.id);

        this.reviews.set(review.id, review);
        const storageUri = this.getStorageLocation();
        if (storageUri) {
            const filename = this.reviewFilename(review.id);
            const fileUri = storageUri.resolve(filename);
            const content = this.serializeReview(review);
            await this.fileService.writeFile(fileUri, BinaryBuffer.fromString(content));
        }
        this.onDidChangeEmitter.fire();
    }

    async deleteByChangeSetId(changeSetId: string): Promise<void> {
        const toDelete: string[] = [];
        for (const [id, review] of this.reviews) {
            if (review.changeSetId === changeSetId) {
                toDelete.push(id);
            }
        }
        for (const id of toDelete) {
            await this.delete(id);
        }
    }

    protected async deleteOtherReviewsForChangeSet(changeSetId: string, excludeId: string): Promise<void> {
        const toDelete: string[] = [];
        for (const [id, review] of this.reviews) {
            if (review.changeSetId === changeSetId && id !== excludeId) {
                toDelete.push(id);
            }
        }
        for (const id of toDelete) {
            await this.delete(id);
        }
    }

    get(id: string): ReviewResult | undefined {
        return this.reviews.get(id);
    }

    getAll(): ReviewResult[] {
        return [...this.reviews.values()];
    }

    getByChangeSetId(changeSetId: string): ReviewResult | undefined {
        for (const review of this.reviews.values()) {
            if (review.changeSetId === changeSetId) {
                return review;
            }
        }
        return undefined;
    }

    async delete(id: string): Promise<boolean> {
        const had = this.reviews.delete(id);
        if (had) {
            const storageUri = this.getStorageLocation();
            if (storageUri) {
                const filename = this.reviewFilename(id);
                const fileUri = storageUri.resolve(filename);
                try {
                    await this.fileService.delete(fileUri);
                } catch {
                    // file may already be gone
                }
            }
            this.onDidChangeEmitter.fire();
        }
        return had;
    }

    async updateDisposition(reviewId: string, areaId: string, disposition: ReviewAreaDisposition): Promise<void> {
        const review = this.reviews.get(reviewId);
        if (!review) {
            return;
        }
        const area = review.areas.find(a => a.id === areaId);
        if (!area) {
            return;
        }
        if (area.disposition === disposition) {
            return;
        }
        area.disposition = disposition;
        await this.store(review);
    }
}
