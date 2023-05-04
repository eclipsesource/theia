// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { Disposable } from '@theia/core/lib/common/disposable';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { DebugSessionContribution, DebugSessionContributionRegistry } from '@theia/debug/lib/browser/debug-session-contribution';

/**
 * Debug session contribution registrator.
 */
export interface PluginDebugSessionContributionRegistrator {
    /**
     * Registers [DebugSessionContribution](#DebugSessionContribution).
     * @param contrib contribution
     */
    registerDebugSessionContribution(contrib: DebugSessionContribution): Disposable;

    /**
     * Unregisters [DebugSessionContribution](#DebugSessionContribution).
     * @param debugType the debug type
     */
    unregisterDebugSessionContribution(debugType: string): void;
}

/**
 * Plugin debug session contribution registry implementation with functionality
 * to register / unregister plugin contributions.
 */
@injectable()
export class PluginDebugSessionContributionRegistry implements DebugSessionContributionRegistry, PluginDebugSessionContributionRegistrator {
    protected readonly contribs = new Map<string, DebugSessionContribution>();

    @inject(ContributionProvider) @named(DebugSessionContribution)
    protected readonly contributions: ContributionProvider<DebugSessionContribution>;

    @postConstruct()
    protected init(): void {
        for (const contrib of this.contributions.getContributions()) {
            this.contribs.set(contrib.debugType, contrib);
        }
    }

    get(debugType: string): DebugSessionContribution | undefined {
        return this.contribs.get(debugType);
    }

    // OVERRIDE so we can adapt the PluginDebugSessionFactory with the hierarchical version of PluginDebugSession
    registerDebugSessionContribution(contrib: DebugSessionContribution): Disposable {
        const { debugType } = contrib;
        contrib.debugSessionFactory;

        if (this.contribs.has(debugType)) {
            console.warn(`Debug session contribution already registered for ${debugType}`);
            return Disposable.NULL;
        }

        this.contribs.set(debugType, contrib);
        return Disposable.create(() => this.unregisterDebugSessionContribution(debugType));
    }

    unregisterDebugSessionContribution(debugType: string): void {
        this.contribs.delete(debugType);
    }
}
