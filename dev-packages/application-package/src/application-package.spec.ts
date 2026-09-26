// *****************************************************************************
// Copyright (C) 2020 Maksim Ryzhikov and others.
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

import * as assert from 'assert';
import * as temp from 'temp';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ApplicationPackage } from './application-package';
import { ApplicationProps } from './application-props';
import { ExtensionPackage } from './extension-package';
import * as sinon from 'sinon';

const track = temp.track();
const sandbox = sinon.createSandbox();

describe('application-package', function (): void {
    after((): void => {
        sandbox.restore();
        track.cleanupSync();
    });

    it('should print warning if user set unknown target in package.json and use browser as a default value', function (): void {
        const warn = sandbox.stub(console, 'warn');
        const root = createProjectWithTarget('foo');
        const applicationPackage = new ApplicationPackage({ projectPath: root });
        assert.deepStrictEqual(applicationPackage.target, ApplicationProps.ApplicationTarget.browser);
        assert.deepStrictEqual(warn.called, true);
    });

    it('should set target from package.json', function (): void {
        const target = 'electron';
        const root = createProjectWithTarget(target);
        const applicationPackage = new ApplicationPackage({ projectPath: root });
        assert.deepStrictEqual(applicationPackage.target, target);
    });

    it('should prefer target from passed options over target from package.json', function (): void {
        const pckTarget = 'electron';
        const optTarget = 'browser';
        const root = createProjectWithTarget(pckTarget);
        const applicationPackage = new ApplicationPackage({ projectPath: root, appTarget: optTarget });
        assert.deepStrictEqual(applicationPackage.target, optTarget);
    });

    it('selects Tauri replacements per manifest entry and reports Electron-only entries', function (): void {
        const root = createProjectWithTarget('tauri');
        const pck = new ApplicationPackage({ projectPath: root });
        // Preserve the collector's package and entry order while avoiding a fixture install.
        (pck as unknown as { _extensionPackages: ExtensionPackage[] })._extensionPackages = [{
            name: '@fixture/mixed',
            theiaExtensions: [
                { frontend: 'generic/a', frontendElectron: 'electron/a', frontendTauri: 'tauri/a', backend: 'generic/b', backendTauri: 'tauri/b' },
                { frontend: 'generic/c', backend: 'generic/d', electronMain: 'electron/main' },
                { frontendElectron: 'electron/only', tauriMain: 'tauri/main' }
            ]
        } as ExtensionPackage];
        assert.deepStrictEqual([...pck.targetFrontendModules.values()], ['@fixture/mixed/tauri/a', '@fixture/mixed/generic/c']);
        assert.deepStrictEqual([...pck.targetBackendModules.values()], ['@fixture/mixed/tauri/b', '@fixture/mixed/generic/d']);
        assert.deepStrictEqual([...pck.targetTauriMainModules.values()], ['@fixture/mixed/tauri/main']);
        assert.deepStrictEqual(pck.missingTauriContributions, [
            '@fixture/mixed: electronMain=electron/main',
            '@fixture/mixed: frontendElectron=electron/only'
        ]);
    });

    it('keeps browser, browser-only, and Electron contribution selection distinct', function (): void {
        for (const [target, frontend, backend, main] of [
            ['browser', ['fixture/generic'], ['fixture/backend'], []],
            ['browser-only', ['fixture/generic'], [], []],
            ['electron', ['fixture/electron'], ['fixture/electron-backend'], ['fixture/main']]
        ] as const) {
            const pck = new ApplicationPackage({ projectPath: createProjectWithTarget(target) });
            (pck as unknown as { _extensionPackages: ExtensionPackage[] })._extensionPackages = [{
                name: 'fixture',
                theiaExtensions: [{
                    frontend: 'generic', frontendElectron: 'electron', frontendTauri: 'tauri',
                    backend: 'backend', backendElectron: 'electron-backend', backendTauri: 'tauri-backend',
                    electronMain: 'main', tauriMain: 'tauri-main'
                }]
            } as ExtensionPackage];
            assert.deepStrictEqual([...pck.targetFrontendModules.values()], frontend);
            assert.deepStrictEqual([...pck.targetBackendModules.values()], backend);
            assert.deepStrictEqual([...pck.targetElectronMainModules.values()], main);
            assert.deepStrictEqual([...pck.targetTauriMainModules.values()], []);
        }
    });

    function createProjectWithTarget(target: string): string {
        const root = track.mkdirSync('foo-project');
        fs.writeFileSync(path.join(root, 'package.json'), `{"theia": {"target": "${target}"}}`);
        return root;
    }
});
