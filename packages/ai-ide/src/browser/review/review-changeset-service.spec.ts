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
import { ContributionProvider, Emitter } from '@theia/core';
import { ReviewChangeSetService } from './review-changeset-service';
import { ReviewChangeSetProvider } from './review-changeset-provider';
import { ReviewChangeSet } from './review-model';
import URI from '@theia/core/lib/common/uri';

describe('ReviewChangeSetService', () => {

    let service: ReviewChangeSetService;
    let providerA: TestProvider;
    let providerB: TestProvider;
    let contributionProvider: ContributionProvider<ReviewChangeSetProvider>;

    class TestProvider implements ReviewChangeSetProvider {
        readonly id: string;
        protected readonly onDidChangeEmitter = new Emitter<void>();
        readonly onDidChangeChangeSets = this.onDidChangeEmitter.event;
        private sets: ReviewChangeSet[] = [];

        constructor(id: string, sets: ReviewChangeSet[] = []) {
            this.id = id;
            this.sets = sets;
        }

        async provideChangeSets(): Promise<ReviewChangeSet[]> {
            return this.sets;
        }

        setSets(newSets: ReviewChangeSet[]): void {
            this.sets = newSets;
            this.onDidChangeEmitter.fire();
        }
    }

    beforeEach(() => {
        providerA = new TestProvider('provider-a', [
            {
                id: 'cs-1',
                label: 'Change Set 1',
                source: 'test-a',
                files: [{
                    uri: new URI('file:///test/file1.ts'),
                    status: 'modified',
                }],
            }
        ]);
        providerB = new TestProvider('provider-b', [
            {
                id: 'cs-2',
                label: 'Change Set 2',
                source: 'test-b',
                files: [{
                    uri: new URI('file:///test/file2.ts'),
                    status: 'added',
                }],
            }
        ]);
        contributionProvider = {
            getContributions: () => [providerA, providerB]
        };

        service = new ReviewChangeSetService();
        (service as unknown as { providers: ContributionProvider<ReviewChangeSetProvider> }).providers = contributionProvider;
        (service as unknown as { init: () => void }).init();
    });

    it('should aggregate change sets from all providers', async () => {
        const sets = await service.getChangeSets();
        expect(sets).to.have.length(2);
        expect(sets[0].id).to.equal('cs-1');
        expect(sets[1].id).to.equal('cs-2');
    });

    it('should return empty array when providers have no change sets', async () => {
        providerA = new TestProvider('provider-a', []);
        providerB = new TestProvider('provider-b', []);
        contributionProvider = {
            getContributions: () => [providerA, providerB]
        };
        const emptyService = new ReviewChangeSetService();
        (emptyService as unknown as { providers: ContributionProvider<ReviewChangeSetProvider> }).providers = contributionProvider;
        (emptyService as unknown as { init: () => void }).init();

        const sets = await emptyService.getChangeSets();
        expect(sets).to.have.length(0);
    });

    it('should emit change event when a provider fires onDidChangeChangeSets', () => {
        const spy = sinon.spy();
        service.onDidChange(spy);
        providerA.setSets([]);
        expect(spy.calledOnce).to.be.true;
    });

    it('should forward events from multiple providers', () => {
        const spy = sinon.spy();
        service.onDidChange(spy);
        providerA.setSets([]);
        providerB.setSets([]);
        expect(spy.calledTwice).to.be.true;
    });

    it('should merge file changes correctly', async () => {
        const sets = await service.getChangeSets();
        const cs1 = sets.find(s => s.id === 'cs-1');
        expect(cs1).to.not.be.undefined;
        expect(cs1!.files).to.have.length(1);
        expect(cs1!.files[0].status).to.equal('modified');

        const cs2 = sets.find(s => s.id === 'cs-2');
        expect(cs2).to.not.be.undefined;
        expect(cs2!.files).to.have.length(1);
        expect(cs2!.files[0].status).to.equal('added');
    });
});
