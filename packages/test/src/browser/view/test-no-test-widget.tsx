// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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
import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { nls } from '@theia/core/lib/common/nls';

@injectable()
export class NoTestWidget extends ReactWidget {

    static ID = 'test-no-test-widget';

    constructor() {
        super();
        this.addClass('theia-test-no-test');
        this.id = NoTestWidget.ID;
    }

    protected render(): React.ReactNode {
        return <AlertMessage
            type='WARNING'
            header={nls.localize('theia/test/noTestFound', 'No tests found')}
        />;
    }

}
