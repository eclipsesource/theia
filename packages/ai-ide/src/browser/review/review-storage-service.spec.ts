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
import { ReviewResult } from './review-model';
import { ReviewStorageService } from './review-storage-service';

/**
 * A minimal testable subclass that bypasses DI and filesystem operations.
 */
class TestableReviewStorageService extends ReviewStorageService {

    constructor() {
        super();
        // Skip @postConstruct init — no DI container
    }

    /** Override to return undefined so store/delete skip filesystem ops. */
    protected override getStorageLocation(): undefined {
        return undefined;
    }

    /** Expose the internal reviews map for assertions. */
    get reviewMap(): Map<string, ReviewResult> {
        return this['reviews'];
    }

    /** Expose serializeReview for testing. */
    testSerialize(review: ReviewResult): string {
        return this['serializeReview'](review);
    }

    /** Expose parseReview for testing. */
    testParse(content: string): ReviewResult | undefined {
        return this['parseReview'](content);
    }
}

function createReview(id: string, changeSetId: string): ReviewResult {
    return {
        id,
        changeSetId,
        timestamp: new Date().toISOString(),
        summary: `Summary for ${id}`,
        areas: [],
    };
}

describe('ReviewStorageService', () => {

    let service: TestableReviewStorageService;

    beforeEach(() => {
        service = new TestableReviewStorageService();
    });

    describe('deleteByChangeSetId', () => {

        it('should delete all reviews matching the given changeSetId', async () => {
            const r1 = createReview('review-cs1-1', 'cs-1');
            const r2 = createReview('review-cs1-2', 'cs-1');
            const r3 = createReview('review-cs2-1', 'cs-2');
            service.reviewMap.set(r1.id, r1);
            service.reviewMap.set(r2.id, r2);
            service.reviewMap.set(r3.id, r3);

            await service.deleteByChangeSetId('cs-1');

            expect(service.get('review-cs1-1')).to.be.undefined;
            expect(service.get('review-cs1-2')).to.be.undefined;
            expect(service.get('review-cs2-1')).to.deep.equal(r3);
        });

        it('should be a no-op when no reviews match', async () => {
            const r1 = createReview('review-1', 'cs-1');
            service.reviewMap.set(r1.id, r1);

            await service.deleteByChangeSetId('cs-nonexistent');

            expect(service.getAll()).to.have.length(1);
        });

        it('should handle an empty reviews map', async () => {
            await service.deleteByChangeSetId('cs-1');
            expect(service.getAll()).to.be.empty;
        });
    });

    describe('store (duplicate guard)', () => {

        it('should remove existing reviews for the same changeSetId when storing', async () => {
            const oldReview = createReview('review-cs1-old', 'cs-1');
            service.reviewMap.set(oldReview.id, oldReview);

            const newReview = createReview('review-cs1-new', 'cs-1');
            await service.store(newReview);

            expect(service.get('review-cs1-old')).to.be.undefined;
            expect(service.get('review-cs1-new')).to.deep.equal(newReview);
            expect(service.getAll()).to.have.length(1);
        });

        it('should not affect reviews for other changeSetIds when storing', async () => {
            const otherReview = createReview('review-cs2-1', 'cs-2');
            service.reviewMap.set(otherReview.id, otherReview);

            const newReview = createReview('review-cs1-new', 'cs-1');
            await service.store(newReview);

            expect(service.get('review-cs2-1')).to.deep.equal(otherReview);
            expect(service.get('review-cs1-new')).to.deep.equal(newReview);
            expect(service.getAll()).to.have.length(2);
        });

        it('should handle storing when no previous review exists for the changeSetId', async () => {
            const review = createReview('review-cs1-1', 'cs-1');
            await service.store(review);

            expect(service.get('review-cs1-1')).to.deep.equal(review);
            expect(service.getAll()).to.have.length(1);
        });

        it('should remove multiple stale reviews for the same changeSetId', async () => {
            const r1 = createReview('review-cs1-a', 'cs-1');
            const r2 = createReview('review-cs1-b', 'cs-1');
            service.reviewMap.set(r1.id, r1);
            service.reviewMap.set(r2.id, r2);

            const newReview = createReview('review-cs1-new', 'cs-1');
            await service.store(newReview);

            expect(service.get('review-cs1-a')).to.be.undefined;
            expect(service.get('review-cs1-b')).to.be.undefined;
            expect(service.get('review-cs1-new')).to.deep.equal(newReview);
            expect(service.getAll()).to.have.length(1);
        });
    });

    describe('getByChangeSetId', () => {

        it('should return the review matching the changeSetId', () => {
            const review = createReview('review-1', 'cs-1');
            service.reviewMap.set(review.id, review);

            expect(service.getByChangeSetId('cs-1')).to.deep.equal(review);
        });

        it('should return undefined when no review matches', () => {
            expect(service.getByChangeSetId('cs-nonexistent')).to.be.undefined;
        });

        it('should return the only review after store replaces duplicates', async () => {
            const old = createReview('review-cs1-old', 'cs-1');
            service.reviewMap.set(old.id, old);

            const fresh = createReview('review-cs1-new', 'cs-1');
            await service.store(fresh);

            const found = service.getByChangeSetId('cs-1');
            expect(found).to.deep.equal(fresh);
            expect(found!.id).to.equal('review-cs1-new');
        });
    });

    describe('store (in-place update)', () => {

        it('should not delete the review being stored (same ID, same changeSetId)', async () => {
            const review = createReview('review-cs1', 'cs-1');
            review.areas = [{
                id: 'area-1',
                label: 'Area 1',
                description: 'Desc',
                files: [],
            }];
            await service.store(review);

            // Mutate and store again with the same ID
            review.areas[0].disposition = 'reviewed';
            await service.store(review);

            expect(service.get('review-cs1')).to.not.be.undefined;
            expect(service.get('review-cs1')!.areas[0].disposition).to.equal('reviewed');
            expect(service.getAll()).to.have.length(1);
        });

        it('should delete other reviews for same changeSetId but keep the one being stored', async () => {
            const old = createReview('review-old', 'cs-1');
            service.reviewMap.set(old.id, old);

            const fresh = createReview('review-new', 'cs-1');
            await service.store(fresh);

            expect(service.get('review-old')).to.be.undefined;
            expect(service.get('review-new')).to.deep.equal(fresh);
            expect(service.getAll()).to.have.length(1);
        });
    });

    describe('updateDisposition', () => {

        it('should update the disposition of an area', async () => {
            const review = createReview('review-1', 'cs-1');
            review.areas = [{
                id: 'area-1',
                label: 'Area 1',
                description: 'Desc',
                files: [],
            }];
            service.reviewMap.set(review.id, review);

            await service.updateDisposition('review-1', 'area-1', 'reviewed');

            expect(service.get('review-1')!.areas[0].disposition).to.equal('reviewed');
        });

        it('should skip store when disposition is unchanged (no-op)', async () => {
            const review = createReview('review-1', 'cs-1');
            review.areas = [{
                id: 'area-1',
                label: 'Area 1',
                description: 'Desc',
                files: [],
                disposition: 'reviewed',
            }];
            service.reviewMap.set(review.id, review);

            let changeCount = 0;
            service.onDidChange(() => changeCount++);

            await service.updateDisposition('review-1', 'area-1', 'reviewed');

            // No event should have fired since disposition didn't change
            expect(changeCount).to.equal(0);
        });

        it('should fire onDidChange when disposition actually changes', async () => {
            const review = createReview('review-1', 'cs-1');
            review.areas = [{
                id: 'area-1',
                label: 'Area 1',
                description: 'Desc',
                files: [],
            }];
            service.reviewMap.set(review.id, review);

            let changeCount = 0;
            service.onDidChange(() => changeCount++);

            await service.updateDisposition('review-1', 'area-1', 'reviewed');

            expect(changeCount).to.equal(1);
        });

        it('should be a no-op when reviewId does not exist', async () => {
            let changeCount = 0;
            service.onDidChange(() => changeCount++);

            await service.updateDisposition('nonexistent', 'area-1', 'reviewed');

            expect(changeCount).to.equal(0);
        });

        it('should be a no-op when areaId does not exist', async () => {
            const review = createReview('review-1', 'cs-1');
            review.areas = [{
                id: 'area-1',
                label: 'Area 1',
                description: 'Desc',
                files: [],
            }];
            service.reviewMap.set(review.id, review);

            let changeCount = 0;
            service.onDidChange(() => changeCount++);

            await service.updateDisposition('review-1', 'nonexistent', 'reviewed');

            expect(changeCount).to.equal(0);
        });
    });

    describe('serialization round-trip for comments', () => {

        it('should preserve file-level and hunk-level comments through serialize/parse', () => {
            const review: ReviewResult = {
                id: 'review-comments-1',
                changeSetId: 'cs-1',
                timestamp: '2026-01-01T00:00:00Z',
                summary: 'Summary with comments',
                areas: [{
                    id: 'area-1',
                    label: 'DI Bindings',
                    description: 'Area-level description for sidebar',
                    files: [{
                        path: 'src/frontend-module.ts',
                        hunkRefs: [
                            { hunkId: 'hunk-1', comment: 'Import statements for review module' },
                            { hunkId: 'hunk-2', startLine: 385, endLine: 392, comment: 'Binds the review widget factory' },
                        ],
                        ranges: [
                            { start: { line: 10, character: 0 }, end: { line: 20, character: 0 } },
                            { start: { line: 385, character: 0 }, end: { line: 392, character: 0 } },
                        ],
                        comment: 'Adds DI bindings for the review framework components',
                    }],
                }],
            };

            const serialized = service.testSerialize(review);
            const parsed = service.testParse(serialized);

            expect(parsed).to.not.be.undefined;
            expect(parsed!.areas).to.have.length(1);
            const areaFile = parsed!.areas[0].files[0];
            expect(areaFile.comment).to.equal('Adds DI bindings for the review framework components');
            expect(areaFile.hunkRefs[0].comment).to.equal('Import statements for review module');
            expect(areaFile.hunkRefs[1].comment).to.equal('Binds the review widget factory');
        });

        it('should handle reviews without comments through serialize/parse', () => {
            const review: ReviewResult = {
                id: 'review-no-comments',
                changeSetId: 'cs-2',
                timestamp: '2026-01-01T00:00:00Z',
                summary: 'Summary without comments',
                areas: [{
                    id: 'area-1',
                    label: 'Area',
                    description: 'Description',
                    files: [{
                        path: 'src/module.ts',
                        hunkRefs: [{ hunkId: 'hunk-1' }],
                        ranges: [{ start: { line: 5, character: 0 }, end: { line: 10, character: 0 } }],
                    }],
                }],
            };

            const serialized = service.testSerialize(review);
            const parsed = service.testParse(serialized);

            expect(parsed).to.not.be.undefined;
            const areaFile = parsed!.areas[0].files[0];
            expect(areaFile.comment).to.be.undefined;
            expect(areaFile.hunkRefs[0].comment).to.be.undefined;
        });
    });
});
