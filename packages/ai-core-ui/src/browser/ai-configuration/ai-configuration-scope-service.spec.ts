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
import { AiConfigurationScope } from './ai-configuration-category';
import { AiConfigurationScopeService, AiConfigurationScopeSelection } from './ai-configuration-scope-service';

describe('AiConfigurationScope mapping', () => {
    it('maps to and from PreferenceScope', () => {
        expect(AiConfigurationScope.toPreferenceScope('user')).to.equal(PreferenceScope.User);
        expect(AiConfigurationScope.toPreferenceScope('workspace')).to.equal(PreferenceScope.Workspace);
        expect(AiConfigurationScope.toPreferenceScope('folder')).to.equal(PreferenceScope.Folder);
        expect(AiConfigurationScope.fromPreferenceScope(PreferenceScope.User)).to.equal('user');
        expect(AiConfigurationScope.fromPreferenceScope(PreferenceScope.Workspace)).to.equal('workspace');
        expect(AiConfigurationScope.fromPreferenceScope(PreferenceScope.Folder)).to.equal('folder');
    });
    it('maps the non-addressable Default scope to undefined', () => {
        expect(AiConfigurationScope.fromPreferenceScope(PreferenceScope.Default)).to.equal(undefined);
    });
});

describe('AiConfigurationScopeService', () => {
    it('defaults to the user scope', () => {
        const service = new AiConfigurationScopeService();
        expect(service.getScope()).to.equal('user');
        expect(service.getResourceUri()).to.equal(undefined);
    });

    it('fires onDidChangeScope with the new selection when the scope changes', () => {
        const service = new AiConfigurationScopeService();
        const seen: AiConfigurationScopeSelection[] = [];
        service.onDidChangeScope(selection => seen.push(selection));
        service.setScope('folder', 'file:///root');
        expect(service.getScope()).to.equal('folder');
        expect(service.getResourceUri()).to.equal('file:///root');
        expect(seen).to.deep.equal([{ scope: 'folder', resourceUri: 'file:///root' }]);
    });

    it('does not fire when the scope and uri are unchanged', () => {
        const service = new AiConfigurationScopeService();
        let fired = 0;
        service.onDidChangeScope(() => fired++);
        service.setScope('workspace');
        service.setScope('workspace');
        expect(fired).to.equal(1);
    });
});
