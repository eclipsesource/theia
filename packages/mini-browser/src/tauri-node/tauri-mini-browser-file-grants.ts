// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs/promises';
import * as path from 'path';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { isUUID } from '@theia/core/lib/common/uuid';

export type PreviewFileResult = { status: 200; file: string } | { status: 400 | 403 | 404 };

/** Restricts one preview origin to the real parent directory of an authorized file. */
export class TauriMiniBrowserFileGrants {
    protected readonly grants = new Map<string, { root: string; expires: number }>();

    async authorizeFile(uri: string, uuid: string): Promise<void> {
        if (!isUUID(uuid) || typeof uri !== 'string' || uri.length > 8192) {
            throw new Error('Invalid mini-browser preview request');
        }
        const resource = new URI(uri);
        if (resource.scheme !== 'file' || resource.authority) {
            throw new Error('Only local files can be previewed');
        }
        const file = await fs.realpath(FileUri.fsPath(resource));
        if (!(await fs.stat(file)).isFile()) {
            throw new Error('Mini-browser preview requires a file');
        }
        const now = Date.now();
        for (const [key, grant] of this.grants) {
            if (grant.expires < now) { this.grants.delete(key); }
        }
        if (this.grants.size >= 200) {
            this.grants.delete(this.grants.keys().next().value!);
        }
        this.grants.set(uuid.toLowerCase(), { root: path.dirname(file), expires: now + 30 * 60 * 1000 });
    }

    async resolveFile(uuid: string, requested: string): Promise<PreviewFileResult> {
        const grant = this.grants.get(uuid.toLowerCase());
        if (!grant || grant.expires < Date.now()) {
            return { status: 403 };
        }
        let relative: string;
        try {
            relative = decodeURIComponent(requested).replace(/^\//, '');
        } catch {
            return { status: 400 };
        }
        if (!relative || relative.includes('\0') || relative.includes('\\')
            || relative.split('/').some(segment => segment.startsWith('.'))) {
            return { status: 403 };
        }
        const target = path.resolve(grant.root, relative);
        let canonical: string;
        try {
            canonical = await fs.realpath(target);
            if (!(await fs.stat(canonical)).isFile()) {
                return { status: 404 };
            }
        } catch {
            return { status: 404 };
        }
        const scoped = path.relative(grant.root, canonical);
        if (!scoped || scoped === '..' || scoped.startsWith(`..${path.sep}`) || path.isAbsolute(scoped)) {
            return { status: 403 };
        }
        grant.expires = Date.now() + 30 * 60 * 1000;
        return { status: 200, file: canonical };
    }
}
