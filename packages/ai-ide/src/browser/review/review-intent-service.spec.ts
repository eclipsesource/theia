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
import { ReviewIntentService } from './review-intent-service';
import { ReviewIntent } from './review-model';

describe('ReviewIntentService', () => {
    let service: ReviewIntentService;

    beforeEach(() => {
        service = new ReviewIntentService();
    });

    function makeIntent(id: string, source: ReviewIntent['source'] = 'manual', label = 'test', content = 'test content'): ReviewIntent {
        return { id, source, label, content };
    }

    describe('addIntent / getIntents', () => {
        it('should add an intent to a change set', () => {
            const intent = makeIntent('i-1');
            service.addIntent('cs-1', intent);

            const result = service.getIntents('cs-1');
            expect(result).to.have.length(1);
            expect(result[0]).to.deep.equal(intent);
        });

        it('should add multiple intents to the same change set', () => {
            service.addIntent('cs-1', makeIntent('i-1', 'task-context', 'Task plan'));
            service.addIntent('cs-1', makeIntent('i-2', 'manual', 'A note'));
            service.addIntent('cs-1', makeIntent('i-3', 'chat-session', 'Session summary'));

            const result = service.getIntents('cs-1');
            expect(result).to.have.length(3);
            expect(result.map(i => i.source)).to.deep.equal(['task-context', 'manual', 'chat-session']);
        });

        it('should return empty array for unknown change set', () => {
            expect(service.getIntents('unknown')).to.deep.equal([]);
        });

        it('should keep intents separate per change set', () => {
            service.addIntent('cs-1', makeIntent('i-1'));
            service.addIntent('cs-2', makeIntent('i-2'));

            expect(service.getIntents('cs-1')).to.have.length(1);
            expect(service.getIntents('cs-2')).to.have.length(1);
            expect(service.getIntents('cs-1')[0].id).to.equal('i-1');
            expect(service.getIntents('cs-2')[0].id).to.equal('i-2');
        });
    });

    describe('removeIntent', () => {
        it('should remove an intent by id', () => {
            service.addIntent('cs-1', makeIntent('i-1'));
            service.addIntent('cs-1', makeIntent('i-2'));

            service.removeIntent('cs-1', 'i-1');

            const result = service.getIntents('cs-1');
            expect(result).to.have.length(1);
            expect(result[0].id).to.equal('i-2');
        });

        it('should clean up map entry when last intent is removed', () => {
            service.addIntent('cs-1', makeIntent('i-1'));
            service.removeIntent('cs-1', 'i-1');

            expect(service.getIntents('cs-1')).to.deep.equal([]);
        });

        it('should not throw for unknown change set', () => {
            expect(() => service.removeIntent('unknown', 'i-1')).to.not.throw();
        });

        it('should not throw for unknown intent id', () => {
            service.addIntent('cs-1', makeIntent('i-1'));
            expect(() => service.removeIntent('cs-1', 'unknown')).to.not.throw();
            expect(service.getIntents('cs-1')).to.have.length(1);
        });
    });

    describe('clearIntents', () => {
        it('should remove all intents for a change set', () => {
            service.addIntent('cs-1', makeIntent('i-1'));
            service.addIntent('cs-1', makeIntent('i-2'));

            service.clearIntents('cs-1');

            expect(service.getIntents('cs-1')).to.deep.equal([]);
        });

        it('should not affect other change sets', () => {
            service.addIntent('cs-1', makeIntent('i-1'));
            service.addIntent('cs-2', makeIntent('i-2'));

            service.clearIntents('cs-1');

            expect(service.getIntents('cs-2')).to.have.length(1);
        });

        it('should not throw for unknown change set', () => {
            expect(() => service.clearIntents('unknown')).to.not.throw();
        });
    });

    describe('onDidChange', () => {
        it('should fire when intent is added', done => {
            service.onDidChange(changeSetId => {
                expect(changeSetId).to.equal('cs-1');
                done();
            });
            service.addIntent('cs-1', makeIntent('i-1'));
        });

        it('should fire when intent is removed', done => {
            service.addIntent('cs-1', makeIntent('i-1'));
            service.onDidChange(changeSetId => {
                expect(changeSetId).to.equal('cs-1');
                done();
            });
            service.removeIntent('cs-1', 'i-1');
        });

        it('should fire when intents are cleared', done => {
            service.addIntent('cs-1', makeIntent('i-1'));
            service.onDidChange(changeSetId => {
                expect(changeSetId).to.equal('cs-1');
                done();
            });
            service.clearIntents('cs-1');
        });

        it('should not fire clearIntents for unknown change set', () => {
            let fired = false;
            service.onDidChange(() => { fired = true; });
            service.clearIntents('unknown');
            expect(fired).to.be.false;
        });
    });

    describe('activeChangeSetId', () => {
        it('should default to undefined', () => {
            expect(service.activeChangeSetId).to.be.undefined;
        });

        it('should store and return the active change set id', () => {
            service.activeChangeSetId = 'cs-1';
            expect(service.activeChangeSetId).to.equal('cs-1');
        });

        it('should allow setting to undefined', () => {
            service.activeChangeSetId = 'cs-1';
            service.activeChangeSetId = undefined;
            expect(service.activeChangeSetId).to.be.undefined;
        });
    });
});
