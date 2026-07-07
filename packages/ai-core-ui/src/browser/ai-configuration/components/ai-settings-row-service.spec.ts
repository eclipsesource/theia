// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { PreferenceInspection, PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { expect } from 'chai';
import { AiSettingsRowService } from './ai-settings-row-service';

disableJSDOM();

interface RecordedSet {
    preferenceId: string;
    value: unknown;
    scope: PreferenceScope | undefined;
    resourceUri: string | undefined;
}

class FakePreferenceService {
    inspection: Partial<PreferenceInspection<unknown>> = {};
    readonly sets: RecordedSet[] = [];

    inspect(): PreferenceInspection<unknown> | undefined {
        return {
            preferenceName: 'test',
            defaultValue: undefined,
            globalValue: undefined,
            workspaceValue: undefined,
            workspaceFolderValue: undefined,
            value: undefined,
            ...this.inspection
        };
    }

    set(preferenceId: string, value: unknown, scope?: PreferenceScope, resourceUri?: string): Promise<void> {
        this.sets.push({ preferenceId, value, scope, resourceUri });
        return Promise.resolve();
    }
}

function createService(inspection: Partial<PreferenceInspection<unknown>>): { service: AiSettingsRowService; preferences: FakePreferenceService } {
    const preferences = new FakePreferenceService();
    preferences.inspection = inspection;
    const service = new AiSettingsRowService();
    (service as unknown as { preferenceService: PreferenceService }).preferenceService = preferences as unknown as PreferenceService;
    return { service, preferences };
}

describe('AiSettingsRowService', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('inspect', () => {
        it('resolves the user-scope value falling back to the default', () => {
            const { service } = createService({ defaultValue: 'd', globalValue: undefined });
            const result = service.inspect('pref', 'user');
            expect(result.value).to.equal('d');
            expect(result.scopeValue).to.equal(undefined);
            expect(result.modified).to.equal(false);
        });

        it('reports a user-scope override as modified', () => {
            const { service } = createService({ defaultValue: 'd', globalValue: 'u' });
            const result = service.inspect('pref', 'user');
            expect(result.value).to.equal('u');
            expect(result.scopeValue).to.equal('u');
            expect(result.modified).to.equal(true);
        });

        it('resolves the workspace value falling back through user then default', () => {
            const { service } = createService({ defaultValue: 'd', globalValue: 'u' });
            const workspace = service.inspect('pref', 'workspace');
            expect(workspace.value).to.equal('u');
            expect(workspace.scopeValue).to.equal(undefined);
            expect(workspace.modified).to.equal(false);

            const { service: service2 } = createService({ defaultValue: 'd', globalValue: 'u', workspaceValue: 'w' });
            const workspace2 = service2.inspect('pref', 'workspace');
            expect(workspace2.value).to.equal('w');
            expect(workspace2.modified).to.equal(true);
        });

        it('resolves the folder value falling back through workspace, user then default', () => {
            const { service } = createService({ defaultValue: 'd', globalValue: 'u', workspaceValue: 'w' });
            const folder = service.inspect('pref', 'folder');
            expect(folder.value).to.equal('w');
            expect(folder.modified).to.equal(false);

            const { service: service2 } = createService({ defaultValue: 'd', workspaceFolderValue: 'f' });
            const folder2 = service2.inspect('pref', 'folder');
            expect(folder2.value).to.equal('f');
            expect(folder2.modified).to.equal(true);
        });

        it('treats a value of `false` as an explicit override (not inherited)', () => {
            const { service } = createService({ defaultValue: true, globalValue: false });
            const result = service.inspect('pref', 'user');
            expect(result.value).to.equal(false);
            expect(result.modified).to.equal(true);
        });
    });

    describe('set / reset', () => {
        it('writes to the mapped preference scope', () => {
            const { service, preferences } = createService({});
            return service.set('pref', 42, 'workspace').then(() => {
                expect(preferences.sets).to.deep.equal([{ preferenceId: 'pref', value: 42, scope: PreferenceScope.Workspace, resourceUri: undefined }]);
            });
        });

        it('resets by writing `undefined` to the mapped scope', () => {
            const { service, preferences } = createService({});
            return service.reset('pref', 'user', 'file:///ws').then(() => {
                expect(preferences.sets).to.deep.equal([{ preferenceId: 'pref', value: undefined, scope: PreferenceScope.User, resourceUri: 'file:///ws' }]);
            });
        });
    });
});
