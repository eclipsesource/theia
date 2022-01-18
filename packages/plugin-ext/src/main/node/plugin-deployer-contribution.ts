/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { BackendApplicationCliContribution, BackendApplicationContribution } from '@theia/core/lib/node';
import { ClientConnectionNotifier } from '@theia/core/lib/common';
import { injectable, inject } from '@theia/core/shared/inversify';
import { PluginDeployer } from '../../common/plugin-protocol';

@injectable()
export class PluginDeployerContribution implements BackendApplicationContribution {

    @inject(PluginDeployer)
    protected pluginDeployer: PluginDeployer;

    @inject(ClientConnectionNotifier)
    protected readonly connectionNotifier: ClientConnectionNotifier;

    @inject(BackendApplicationCliContribution)
    protected readonly cliParams: BackendApplicationCliContribution;

    initialize(): void {
        if (this.cliParams.fastStartup) {
            this.connectionNotifier.connectionEvent.on(ClientConnectionNotifier.CLIENT_CONNECTED, async () => {
                this.pluginDeployer.start();
            });
        } else {
            this.pluginDeployer.start();
        }
    }
}
