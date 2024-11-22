// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { injectable } from '@theia/core/shared/inversify';
import { ScanOSSResult, ScanOSSService } from '../common';

import { Scanner, ScannerComponent } from 'scanoss';

// Define our own type of what is actually returned by the scanner
type ScanContentsResult<T extends string> = {
    [K in T]: ScannerComponent[];
};

// Helper class to perform scans sequentially
class SequentialProcessor<T> {
    private queue: Promise<T> = Promise.resolve() as Promise<T>;
    public async processTask(task: () => Promise<T>): Promise<T> {
        this.queue = this.queue.then(() => task());
        return this.queue;
    }
}

@injectable()
export class ScanOSSServiceImpl implements ScanOSSService {

    private readonly processor = new SequentialProcessor<ScanOSSResult>();

    async scanContent(content: string, apiKey?: string): Promise<ScanOSSResult> {
        return this.processor.processTask(async () => this.doScanContent(content, apiKey));
    }

    async doScanContent(content: string, apiKey?: string): Promise<ScanOSSResult> {
        const scanner = new Scanner(/* {
            API_KEY: apiKey || process.env.SCANOSS_API_KEY || undefined,
            MAX_RESPONSES_IN_BUFFER: 1,
        } as ScannerCfg*/);
        let results = undefined;
        try {
            results = await scanner.scanContents({
                content,
                key: 'content_scanning',
            }) as unknown as ScanContentsResult<'/content_scanning'> | null;
        } catch (e) {
            console.error('ScanOSS error', e);
        }
        if (!results) {
            return {
                type: 'error',
                message: 'Scan request unsuccessful'
            };
        }

        // eslint-disable-next-line no-null/no-null
        console.log('ScanOSS results', JSON.stringify(results, null, 2));
        // check first of the results
        const firstEntry = results['/content_scanning'][0];
        if (firstEntry.id === 'none') {
            return {
                type: 'clean'
            };
        }
        return {
            type: 'match',
            matched: firstEntry.matched,
            url: firstEntry.url,
            raw: firstEntry
        };
    }
}
