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
import { PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { inject, injectable } from '@theia/core/shared/inversify';
import type { SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { AiConfigurationScope } from '../ai-configuration-category';

/** Describes which control an `AiSettingsRow` renders for a preference value. */
export type AiSettingsControl =
    | { readonly type: 'boolean' }
    | { readonly type: 'string'; readonly placeholder?: string }
    | { readonly type: 'number'; readonly min?: number; readonly max?: number; readonly step?: number }
    | { readonly type: 'select'; readonly options: SelectOption[] }
    | { readonly type: 'array'; readonly placeholder?: string };

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

    @inject(PreferenceSchemaService)
    protected readonly schemaService: PreferenceSchemaService;

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

    /**
     * Reads the (already-localized) label and markdown description a preference declares in its
     * registered schema, so settings rows do not have to re-author those strings. Returns
     * `undefined` fields when the preference is unknown or omits them.
     */
    describe(preferenceId: string): { label?: string; description?: string } {
        const property = this.schemaService.getSchemaProperty(preferenceId);
        return {
            label: property?.title,
            description: property?.markdownDescription ?? property?.description
        };
    }

    /**
     * Builds {@link SelectOption}s from a preference's `enum`, using its `enumItemLabels`
     * (falling back to `enumDescriptions`, then the raw value) for the display label.
     * Returns an empty array when the preference declares no enum.
     */
    enumOptions(preferenceId: string): SelectOption[] {
        const property = this.schemaService.getSchemaProperty(preferenceId);
        const values = property?.enum;
        if (!values) {
            return [];
        }
        const labels = property?.enumItemLabels ?? property?.enumDescriptions;
        return values.map((value, index) => ({ value: String(value), label: labels?.[index] ?? String(value) }));
    }

    /** All registered preference ids, e.g. to discover a provider's `ai-features.<provider>.*` block. */
    preferenceIds(): string[] {
        return Array.from(this.schemaService.getSchemaProperties().keys());
    }

    /**
     * Infers a sensible {@link AiSettingsControl} for a preference from its schema `type`
     * (a `select` when it declares an `enum`). Falls back to a text input for unknown types.
     */
    controlFor(preferenceId: string): AiSettingsControl {
        const property = this.schemaService.getSchemaProperty(preferenceId);
        if (property?.enum) {
            return { type: 'select', options: this.enumOptions(preferenceId) };
        }
        switch (property?.type) {
            case 'boolean':
                return { type: 'boolean' };
            case 'number':
            case 'integer':
                return { type: 'number', min: property.minimum, max: property.maximum };
            case 'array':
                return { type: 'array' };
            default:
                return { type: 'string' };
        }
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
