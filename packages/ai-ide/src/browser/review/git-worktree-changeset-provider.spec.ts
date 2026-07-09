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
import * as sinon from 'sinon';
import URI from '@theia/core/lib/common/uri';
import { ReviewFileChange } from './review-model';
import { GitWorktreeChangeSetProvider } from './git-worktree-changeset-provider';

describe('GitWorktreeChangeSetProvider — hunk computation', () => {
    let provider: GitWorktreeChangeSetProvider;
    let readFileStub: sinon.SinonStub;
    let readOriginalStub: sinon.SinonStub;

    beforeEach(() => {
        provider = new GitWorktreeChangeSetProvider();

        readFileStub = sinon.stub(provider as unknown as { readFileContent: unknown }, 'readFileContent');
        readOriginalStub = sinon.stub(provider as unknown as { readOriginalContent: unknown }, 'readOriginalContent');

        // Provide a mock logger
        (provider as unknown as { logger: { warn: (msg: string) => void } }).logger = {
            warn: () => { },
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    function makeFile(status: ReviewFileChange['status']): ReviewFileChange {
        return {
            uri: new URI('file:///test/src/module.ts'),
            originalUri: status !== 'added' ? new URI('git:///test/src/module.ts?HEAD') : undefined,
            modifiedUri: status !== 'deleted' ? new URI('file:///test/src/module.ts') : undefined,
            status,
        };
    }

    describe('added files', () => {
        it('should produce a single hunk covering the entire file', async () => {
            const file = makeFile('added');
            readFileStub.resolves('line 1\nline 2\nline 3');

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.have.length(1);
            expect(hunks[0].id).to.equal('hunk-1');
            expect(hunks[0].type).to.equal('added');
            expect(hunks[0].modifiedRange.start.line).to.equal(0);
            expect(hunks[0].modifiedRange.end.line).to.equal(2);
            expect(hunks[0].originalRange.start.line).to.equal(0);
            expect(hunks[0].originalRange.end.line).to.equal(0);
            expect(hunks[0].content).to.include('+ line 1');
            expect(hunks[0].content).to.include('+ line 2');
            expect(hunks[0].content).to.include('+ line 3');
        });

        it('should return empty hunks when modifiedUri is missing', async () => {
            const file: ReviewFileChange = {
                uri: new URI('file:///test/src/module.ts'),
                status: 'added',
            };

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.be.empty;
        });
    });

    describe('deleted files', () => {
        it('should produce a single hunk covering the entire original file', async () => {
            const file = makeFile('deleted');
            readOriginalStub.resolves('old line 1\nold line 2');

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.have.length(1);
            expect(hunks[0].id).to.equal('hunk-1');
            expect(hunks[0].type).to.equal('deleted');
            expect(hunks[0].originalRange.start.line).to.equal(0);
            expect(hunks[0].originalRange.end.line).to.equal(1);
            expect(hunks[0].modifiedRange.start.line).to.equal(0);
            expect(hunks[0].modifiedRange.end.line).to.equal(0);
            expect(hunks[0].content).to.include('- old line 1');
            expect(hunks[0].content).to.include('- old line 2');
        });

        it('should return empty hunks when originalUri is missing', async () => {
            const file: ReviewFileChange = {
                uri: new URI('file:///test/src/module.ts'),
                status: 'deleted',
            };

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.be.empty;
        });
    });

    describe('modified files', () => {
        it('should compute hunks from diff', async () => {
            const file = makeFile('modified');
            readOriginalStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5');
            readFileStub.resolves('line 1\nmodified line 2\nline 3\nline 4\nline 5');

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.have.length(1);
            expect(hunks[0].id).to.equal('hunk-1');
            expect(hunks[0].type).to.equal('modified');
            expect(hunks[0].content).to.include('- line 2');
            expect(hunks[0].content).to.include('+ modified line 2');
        });

        it('should compute multiple hunks for multiple changes', async () => {
            const file = makeFile('modified');
            readOriginalStub.resolves('line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8');
            readFileStub.resolves('line 1\nchanged 2\nline 3\nline 4\nline 5\nline 6\nchanged 7\nline 8');

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.have.length(2);
            expect(hunks[0].id).to.equal('hunk-1');
            expect(hunks[1].id).to.equal('hunk-2');
        });

        it('should produce hunk IDs that are stable and sequential', async () => {
            const file = makeFile('modified');
            readOriginalStub.resolves('a\nb\nc\nd\ne\nf\ng\nh\ni');
            readFileStub.resolves('a\nB\nc\nD\ne\nF\ng\nh\ni');

            const hunks = await provider.computeHunks(file);

            expect(hunks.length).to.be.greaterThanOrEqual(3);
            for (let i = 0; i < hunks.length; i++) {
                expect(hunks[i].id).to.equal(`hunk-${i + 1}`);
            }
        });

        it('should handle addition-only changes', async () => {
            const file = makeFile('modified');
            readOriginalStub.resolves('line 1\nline 2');
            readFileStub.resolves('line 1\nnew line\nline 2');

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.have.length(1);
            expect(hunks[0].type).to.equal('added');
            expect(hunks[0].content).to.include('+ new line');
        });

        it('should handle removal-only changes', async () => {
            const file = makeFile('modified');
            readOriginalStub.resolves('line 1\nremoved\nline 2');
            readFileStub.resolves('line 1\nline 2');

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.have.length(1);
            expect(hunks[0].type).to.equal('deleted');
            expect(hunks[0].content).to.include('- removed');
        });

        it('should return empty hunks when no URIs are available', async () => {
            const file: ReviewFileChange = {
                uri: new URI('file:///test/src/module.ts'),
                status: 'modified',
            };

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.be.empty;
        });

        it('should return empty hunks on read error', async () => {
            const file = makeFile('modified');
            readOriginalStub.rejects(new Error('File not found'));
            readFileStub.resolves('line 1');

            const hunks = await provider.computeHunks(file);

            expect(hunks).to.be.empty;
        });
    });
});
