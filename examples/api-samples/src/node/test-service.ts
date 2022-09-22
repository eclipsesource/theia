// *****************************************************************************
// Copyright (C) 2022 EclipseSource & others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { CancellationToken } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { TestService } from '../common/updater/test-service';

@injectable()
export class TestServiceImpl implements TestService {

    async foo(cancelToken?: CancellationToken | undefined): Promise<string> {
        let result = 'bar';
        cancelToken?.onCancellationRequested(() => result = 'canceled');
        await delay(2500);
        return result;
    }

}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
