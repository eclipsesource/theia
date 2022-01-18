/********************************************************************************
 * Copyright (C) 2022 STMicroelectronics and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import { injectable } from 'inversify';
import * as events from 'events';

export const ConnectionTimeout = Symbol('ConnectionTimeout');

@injectable()
export class ClientConnectionNotifier {

    static readonly CLIENT_CONNECTED = 'clientConnected';

    readonly connectionEvent = new events.EventEmitter();

    currentlyConnected = false;

    async clientConnected(): Promise<void> {
        if (!this.currentlyConnected) {
            this.currentlyConnected = true;
            this.connectionEvent.emit(ClientConnectionNotifier.CLIENT_CONNECTED);
        }
    }

}
