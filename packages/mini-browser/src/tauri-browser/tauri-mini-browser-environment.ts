// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { MiniBrowserEnvironment } from '../browser/environment/mini-browser-environment';

@injectable()
export class TauriMiniBrowserEnvironment extends MiniBrowserEnvironment {
    protected override getHostPattern(): Promise<string> {
        return Promise.resolve(`{{uuid}}.mini-browser.localhost:${window.location.port}`);
    }
}
