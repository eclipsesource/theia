// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { strict as assert } from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { withNativeModuleLock } from './native-module-lock';

describe('native module rebuild lock', () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'theia-native-module-lock-'));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it('waits for the first rebuild before starting the next', async () => {
        let firstEntered!: () => void;
        let releaseFirst!: () => void;
        const entered = new Promise<void>(resolve => firstEntered = resolve);
        const gate = new Promise<void>(resolve => releaseFirst = resolve);
        const first = withNativeModuleLock(root, async () => {
            firstEntered();
            await gate;
        });
        await entered;
        let secondStarted = false;
        const second = withNativeModuleLock(root, async () => {
            secondStarted = true;
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        assert.equal(secondStarted, false);
        releaseFirst();
        await Promise.all([first, second]);
        assert.equal(secondStarted, true);
    });

    it('reports a lock left by an exited process', async () => {
        const lock = path.join(root, '.browser_modules.lock');
        await fs.mkdir(lock);
        await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: 99999999 }));
        await assert.rejects(withNativeModuleLock(root, async () => undefined), /Stale native module rebuild lock/);
    });
});
