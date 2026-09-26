// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { FileLocationMapper } from '../browser/location-mapper-service';
import { TauriMiniBrowserService } from '../common/tauri-mini-browser-service';

@injectable()
export class TauriFileLocationMapper extends FileLocationMapper {
    @inject(TauriMiniBrowserService)
    protected readonly tauriService: TauriMiniBrowserService;

    override canHandle(location: string): number {
        return location.startsWith('file://') ? 2 : 0;
    }

    override async map(location: string): Promise<string> {
        const uri = new URI(location);
        if (uri.scheme !== 'file') {
            throw new Error('Only local file URIs can be previewed');
        }
        const uuid = generateUuid();
        await this.tauriService.authorizeFile(location, uuid);
        const endpoint = this.miniBrowserEnvironment.getEndpoint(uuid).getRestUrl().toString();
        return `${endpoint}/${encodeURIComponent(uri.path.base)}`;
    }
}
