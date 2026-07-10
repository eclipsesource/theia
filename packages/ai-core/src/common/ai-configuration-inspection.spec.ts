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
import { PreferenceScope } from '@theia/core/lib/common/preferences';
import { AiConfigurationInspection } from './ai-configuration-service';

/** Builds a full inspection (all scope fields present) from a partial, so tests can omit unset scopes. */
function insp(overrides: Partial<AiConfigurationInspection<string>>): AiConfigurationInspection<string> {
    return {
        preferenceName: 'ai-features.example',
        defaultValue: undefined,
        globalValue: undefined,
        workspaceValue: undefined,
        workspaceFolderValue: undefined,
        value: undefined as unknown as string,
        ...overrides
    };
}

describe('AiConfigurationInspection scope helpers', () => {

    const inspection = insp({ defaultValue: 'default', globalValue: 'user', workspaceValue: 'workspace', workspaceFolderValue: 'folder' });

    describe('valueInScope (no fall-through)', () => {
        it('returns the explicit value set in the requested scope', () => {
            expect(AiConfigurationInspection.valueInScope(inspection, PreferenceScope.User)).to.equal('user');
            expect(AiConfigurationInspection.valueInScope(inspection, PreferenceScope.Workspace)).to.equal('workspace');
            expect(AiConfigurationInspection.valueInScope(inspection, PreferenceScope.Folder)).to.equal('folder');
        });
        it('returns undefined when the scope does not override the value', () => {
            const onlyUser = insp({ defaultValue: 'd', globalValue: 'user' });
            expect(AiConfigurationInspection.valueInScope(onlyUser, PreferenceScope.Workspace)).to.equal(undefined);
            expect(AiConfigurationInspection.valueInScope(undefined, PreferenceScope.User)).to.equal(undefined);
        });
    });

    describe('effectiveValueInScope (with fall-through)', () => {
        it('resolves each scope narrowest-first, falling back to broader scopes then the default', () => {
            const onlyUser = insp({ defaultValue: 'd', globalValue: 'user' });
            expect(AiConfigurationInspection.effectiveValueInScope(onlyUser, PreferenceScope.User)).to.equal('user');
            expect(AiConfigurationInspection.effectiveValueInScope(onlyUser, PreferenceScope.Workspace)).to.equal('user');
            expect(AiConfigurationInspection.effectiveValueInScope(onlyUser, PreferenceScope.Folder)).to.equal('user');
        });
        it('prefers the narrowest set scope', () => {
            expect(AiConfigurationInspection.effectiveValueInScope(inspection, PreferenceScope.Folder)).to.equal('folder');
            const noFolder = insp({ defaultValue: 'default', globalValue: 'user', workspaceValue: 'workspace' });
            expect(AiConfigurationInspection.effectiveValueInScope(noFolder, PreferenceScope.Folder)).to.equal('workspace');
        });
        it('falls back to the default value when nothing is set', () => {
            const onlyDefault = insp({ defaultValue: 'd' });
            expect(AiConfigurationInspection.effectiveValueInScope(onlyDefault, PreferenceScope.Workspace)).to.equal('d');
        });
    });

    describe('otherModifiedScopes', () => {
        it('lists the other scopes that explicitly set a value, in precedence order', () => {
            expect(AiConfigurationInspection.otherModifiedScopes(inspection, PreferenceScope.User))
                .to.deep.equal([PreferenceScope.Workspace, PreferenceScope.Folder]);
            expect(AiConfigurationInspection.otherModifiedScopes(inspection, PreferenceScope.Workspace))
                .to.deep.equal([PreferenceScope.User, PreferenceScope.Folder]);
        });
        it('excludes the current scope and scopes that do not override the value', () => {
            const userAndWorkspace = insp({ defaultValue: 'd', globalValue: 'user', workspaceValue: 'ws' });
            expect(AiConfigurationInspection.otherModifiedScopes(userAndWorkspace, PreferenceScope.Workspace)).to.deep.equal([PreferenceScope.User]);
            expect(AiConfigurationInspection.otherModifiedScopes(userAndWorkspace, PreferenceScope.User)).to.deep.equal([PreferenceScope.Workspace]);
        });
    });
});
