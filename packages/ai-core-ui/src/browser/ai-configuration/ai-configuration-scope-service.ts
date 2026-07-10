// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { Emitter, Event } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { AiConfigurationScope } from './ai-configuration-category';

/** The active scope of the AI Configuration view, together with the folder uri when scope is `folder`. */
export interface AiConfigurationScopeSelection {
    readonly scope: AiConfigurationScope;
    /** Folder uri; defined only when {@link scope} is `folder`. */
    readonly resourceUri?: string;
}

/**
 * Shared carrier for the AI Configuration view's active scope. The title bar's scope tabs write it,
 * and the detail host reads it to build the {@link AiConfigurationRenderContext}. Keeping it separate
 * from the selection model (which tracks the selected category/item) lets scope change independently
 * of navigation. This service is a dumb carrier; which scopes are applicable (e.g. whether a Folder
 * tab is shown and for which folder) is decided by the title bar, which owns the `WorkspaceService`.
 */
@injectable()
export class AiConfigurationScopeService {

    protected selection: AiConfigurationScopeSelection = { scope: 'user' };

    protected readonly onDidChangeScopeEmitter = new Emitter<AiConfigurationScopeSelection>();
    readonly onDidChangeScope: Event<AiConfigurationScopeSelection> = this.onDidChangeScopeEmitter.event;

    getScope(): AiConfigurationScope {
        return this.selection.scope;
    }

    getResourceUri(): string | undefined {
        return this.selection.resourceUri;
    }

    getSelection(): AiConfigurationScopeSelection {
        return this.selection;
    }

    setScope(scope: AiConfigurationScope, resourceUri?: string): void {
        if (this.selection.scope === scope && this.selection.resourceUri === resourceUri) {
            return;
        }
        this.selection = { scope, resourceUri };
        this.onDidChangeScopeEmitter.fire(this.selection);
    }
}
