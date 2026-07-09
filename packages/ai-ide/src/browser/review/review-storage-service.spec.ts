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
});
