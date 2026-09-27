// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import fs = require('fs-extra');
import path = require('path');

const RETRY_MS = 250;
const INCOMPLETE_LOCK_MS = 5000;

interface LockOwner {
    pid: number;
}

/** Serialize changes to the shared native modules and their browser backup. */
export async function withNativeModuleLock<T>(cacheRoot: string, run: () => Promise<T>, checkCancelled: () => Promise<void> = async () => undefined): Promise<T> {
    const lock = path.resolve(cacheRoot, '.browser_modules.lock');
    const ownerPath = path.join(lock, 'owner.json');
    await fs.ensureDir(cacheRoot);
    while (true) {
        await checkCancelled();
        try {
            await fs.mkdir(lock);
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }
        }
        let owner: LockOwner | undefined;
        try {
            owner = await fs.readJson(ownerPath);
        } catch {
            // The owner may still be writing the file, or may have exited first.
        }
        if (owner && Number.isInteger(owner.pid) && owner.pid > 0) {
            try {
                process.kill(owner.pid, 0);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
                    throw new Error(`Stale native module rebuild lock at ${lock} (process ${owner.pid} exited). Remove it after checking no rebuild is running.`);
                }
            }
        } else {
            try {
                if (Date.now() - (await fs.stat(lock)).mtimeMs > INCOMPLETE_LOCK_MS) {
                    throw new Error(`Incomplete native module rebuild lock at ${lock}. Remove it after checking no rebuild is running.`);
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error;
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_MS));
    }
    try {
        await fs.writeJson(ownerPath, { pid: process.pid });
        await checkCancelled();
        return await run();
    } finally {
        await fs.remove(lock);
    }
}
