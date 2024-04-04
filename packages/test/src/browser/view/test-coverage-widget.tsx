// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TreeImpl } from '@theia/core/src/browser';
import { TestService } from '../test-service';

const ROOT_ID = 'TestCoverageTree';

@injectable()
export class TestCoverageTree extends TreeImpl {

    @inject(TestService) protected readonly testService: TestService;

    @postConstruct()
    init(): void {
        console.log(ROOT_ID + this.testService);
    }
}
