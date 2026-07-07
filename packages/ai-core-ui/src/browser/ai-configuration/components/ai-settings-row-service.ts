// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { Event } from '@theia/core';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AiConfigurationScope } from '../ai-configuration-category';

/**
 * The value of a single preference as seen from a particular {@link AiConfigurationScope},
 * together with the information the {@link AiSettingsRow} needs to render the
 * modified indicator and the reset affordance.
 */
export interface AiSettingsInspection {
    /** Effective value resolved for the requested scope (falling back through broader scopes and the default). */
    readonly value: unknown;
    /** Value explicitly set in the requested scope; `undefined` means the value is inherited or default. */
    readonly scopeValue: unknown;
    /** Default (schema) value. */
    readonly defaultValue: unknown;
    /** `true` when the requested scope explicitly overrides the value, i.e. a reset is meaningful. */
    readonly modified: boolean;
}

/**
 * Thin, injectable wrapper around {@link PreferenceService} and {@link MarkdownRenderer}
 * used by the presentational {@link AiSettingsRow} component, which must not itself
 * depend on the DI container. Owning renderers/widgets inject this service and pass
 * it down to the row.
 */
@injectable()
export class AiSettingsRowService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(MarkdownRenderer)
    protected readonly markdownRenderer: MarkdownRenderer;

    protected changed: Event<void> | undefined;

    /** Fires whenever any preference changes, so owning widgets can re-render their rows. */
    get onPreferenceChanged(): Event<void> {
        return this.changed ??= Event.map(this.preferenceService.onPreferenceChanged, () => undefined);
    }

    inspect(preferenceId: string, scope: AiConfigurationScope, resourceUri?: string): AiSettingsInspection {
        const inspection = this.preferenceService.inspect(preferenceId, resourceUri);
        const defaultValue = inspection?.defaultValue;
        const globalValue = inspection?.globalValue;
        const workspaceValue = inspection?.workspaceValue;
        const folderValue = inspection?.workspaceFolderValue;

        let scopeValue: unknown;
        let value: unknown;
        switch (scope) {
            case 'user':
                scopeValue = globalValue;
                value = globalValue ?? defaultValue;
                break;
            case 'workspace':
                scopeValue = workspaceValue;
                value = workspaceValue ?? globalValue ?? defaultValue;
                break;
            case 'folder':
                scopeValue = folderValue;
                value = folderValue ?? workspaceValue ?? globalValue ?? defaultValue;
                break;
        }
        return { value, scopeValue, defaultValue, modified: scopeValue !== undefined };
    }

    set(preferenceId: string, value: unknown, scope: AiConfigurationScope, resourceUri?: string): Promise<void> {
        return this.preferenceService.set(preferenceId, value, this.toPreferenceScope(scope), resourceUri);
    }

    reset(preferenceId: string, scope: AiConfigurationScope, resourceUri?: string): Promise<void> {
        return this.preferenceService.set(preferenceId, undefined, this.toPreferenceScope(scope), resourceUri);
    }

    /** Renders a markdown description into a detached element for use in a React `ref`. */
    renderMarkdown(markdown: string): HTMLElement {
        return this.markdownRenderer.render(new MarkdownStringImpl(markdown)).element;
    }

    protected toPreferenceScope(scope: AiConfigurationScope): PreferenceScope {
        switch (scope) {
            case 'user':
                return PreferenceScope.User;
            case 'workspace':
                return PreferenceScope.Workspace;
            case 'folder':
                return PreferenceScope.Folder;
        }
    }
}
