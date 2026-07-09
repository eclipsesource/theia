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
import {
    ReviewChangeSet,
    ReviewFileChange,
    ReviewResult,
    ReviewArea,
    ReviewAreaFile,
    ReviewAreaDisposition,
} from './review-model';

describe('Review Model Types', () => {

    it('should create a valid ReviewChangeSet', () => {
        const cs: ReviewChangeSet = {
            id: 'test-cs-1',
            label: 'Working tree changes',
            source: 'git-worktree',
            files: [],
        };
        expect(cs.id).to.equal('test-cs-1');
        expect(cs.label).to.equal('Working tree changes');
        expect(cs.source).to.equal('git-worktree');
        expect(cs.files).to.be.empty;
        expect(cs.metadata).to.be.undefined;
    });

    it('should create a ReviewChangeSet with metadata', () => {
        const cs: ReviewChangeSet = {
            id: 'test-cs-2',
            label: 'PR #42',
            source: 'github-pr',
            files: [],
            metadata: { prUrl: 'https://github.com/test/repo/pull/42' },
        };
        expect(cs.metadata).to.deep.equal({ prUrl: 'https://github.com/test/repo/pull/42' });
    });

    it('should create a valid ReviewFileChange', () => {
        const fileChange: ReviewFileChange = {
            uri: new URI('file:///test/src/foo.ts'),
            originalUri: new URI('git:///test/src/foo.ts?HEAD'),
            modifiedUri: new URI('file:///test/src/foo.ts'),
            status: 'modified',
        };
        expect(fileChange.status).to.equal('modified');
        expect(fileChange.uri.path.base).to.equal('foo.ts');
        expect(fileChange.oldPath).to.be.undefined;
    });

    it('should support all file change statuses', () => {
        const statuses: ReviewFileChange['status'][] = ['added', 'modified', 'deleted', 'renamed'];
        for (const status of statuses) {
            const fc: ReviewFileChange = {
                uri: new URI('file:///test/file.ts'),
                status,
            };
            expect(fc.status).to.equal(status);
        }
    });

    it('should create a valid ReviewResult', () => {
        const result: ReviewResult = {
            id: 'review-1',
            changeSetId: 'cs-1',
            timestamp: '2026-01-01T00:00:00Z',
            summary: 'This change adds new functionality.',
            areas: [],
        };
        expect(result.id).to.equal('review-1');
        expect(result.summary).to.equal('This change adds new functionality.');
        expect(result.areas).to.be.empty;
    });

    it('should create a valid ReviewArea with disposition', () => {
        const areaFile: ReviewAreaFile = {
            path: 'src/service.ts',
            ranges: [{ start: { line: 10, character: 0 }, end: { line: 25, character: 0 } }],
        };
        const area: ReviewArea = {
            id: 'area-1',
            label: 'New authentication middleware',
            description: 'Adds JWT validation for API routes.',
            files: [areaFile],
            disposition: 'reviewed',
            developerNotes: 'Looks good.',
        };
        expect(area.label).to.equal('New authentication middleware');
        expect(area.files).to.have.length(1);
        expect(area.files[0].ranges).to.have.length(1);
        expect(area.disposition).to.equal('reviewed');
        expect(area.developerNotes).to.equal('Looks good.');
    });

    it('should support all disposition values', () => {
        const dispositions: ReviewAreaDisposition[] = ['reviewed', 'needs-work', 'dismissed'];
        for (const disposition of dispositions) {
            const area: ReviewArea = {
                id: 'area-test',
                label: 'Test',
                description: 'Test',
                files: [],
                disposition,
            };
            expect(area.disposition).to.equal(disposition);
        }
    });
});
