// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AsyncSubscription, Event, getEventsSince, subscribe, writeSnapshot } from '@theia/core/shared/@parcel/watcher';

/**
 * The Tauri example may start in a desktop session that has exhausted the
 * per-user inotify instance limit. Parcel watcher hangs in native startup when
 * inotify_init1 fails, so use its snapshot backend for these small registries.
 */
export async function subscribeToRegistryDirectory(root: string, listener: (error: Error | null, events: Event[]) => void): Promise<AsyncSubscription> {
    if (process.env.THEIA_TARGET !== 'tauri' || process.platform !== 'linux') {
        return subscribe(root, listener);
    }

    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'theia-registry-watch-'));
    const snapshot = path.join(temp, 'snapshot');
    const options = { backend: 'brute-force' as const };
    try {
        await writeSnapshot(root, snapshot, options);
    } catch (error) {
        await fs.rm(temp, { recursive: true, force: true });
        throw error;
    }

    let stopped = false;
    let pending: Promise<void> | undefined;
    const timer = setInterval(() => {
        if (stopped || pending) {
            return;
        }
        pending = (async () => {
            try {
                const events = await getEventsSince(root, snapshot, options);
                if (events.length > 0) {
                    await writeSnapshot(root, snapshot, options);
                    if (!stopped) {
                        listener(null, events); // eslint-disable-line no-null/no-null
                    }
                }
            } catch (error) {
                if (!stopped) {
                    listener(error instanceof Error ? error : new Error(String(error)), []);
                }
            } finally {
                pending = undefined;
            }
        })();
    }, 1000);
    timer.unref();
    return {
        unsubscribe: async () => {
            stopped = true;
            clearInterval(timer);
            await pending;
            await fs.rm(temp, { recursive: true, force: true });
        }
    };
}
