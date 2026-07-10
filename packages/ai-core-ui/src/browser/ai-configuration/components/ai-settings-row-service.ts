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

import { CommandService, Event } from '@theia/core';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { PreferenceDataProperty, PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { PreferencesCommands } from '@theia/preferences/lib/browser/util/preference-types';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { inject, injectable } from '@theia/core/shared/inversify';
import type { SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { MODEL_PROVIDER_TYPE_DETAIL, ModelProviderTypeDetail } from '@theia/ai-core/lib/common/ai-core-preferences';
import { AiConfigurationScope } from '../ai-configuration-category';

/** Describes which control an `AiSettingsRow` renders for a preference value. */
export type AiSettingsControl =
    | { readonly type: 'boolean' }
    | { readonly type: 'string'; readonly placeholder?: string }
    | { readonly type: 'number'; readonly min?: number; readonly max?: number; readonly step?: number }
    | { readonly type: 'select'; readonly options: SelectOption[] }
    | { readonly type: 'array'; readonly placeholder?: string }
    | { readonly type: 'json' };

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

    @inject(CommandService)
    protected readonly commandService: CommandService;

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

    /**
     * Opens the underlying `settings.json` file focused on a preference, mirroring the
     * Settings view's "Edit in settings.json" link. Used for `json` controls, i.e. complex
     * object/array values that cannot be edited meaningfully through an inline control.
     */
    editInSettings(preferenceId: string): void {
        this.commandService.executeCommand(PreferencesCommands.OPEN_PREFERENCES_JSON_TOOLBAR.id, preferenceId);
    }

    /** Renders a markdown description into a detached element for use in a React `ref`. */
    renderMarkdown(markdown: string): HTMLElement {
        return this.markdownRenderer.render(new MarkdownStringImpl(this.normalizeMarkdown(markdown))).element;
    }

    /**
     * Strips the common leading indentation from a markdown description before rendering.
     *
     * Preference `markdownDescription`s are commonly authored as indented, multi-line JavaScript
     * string literals, which leaves every continuation line prefixed with the source indentation.
     * That accidental indentation makes markdown-it collapse bullet lists and paragraphs into a
     * single dense block, so the description reads as an unstructured run-on. Removing the shared
     * indentation (ignoring the first line, which starts right after the opening quote) restores
     * the intended paragraph and list structure while preserving relative indentation, so nested
     * lists stay nested.
     */
    protected normalizeMarkdown(markdown: string): string {
        const lines = markdown.split('\n');
        let common = Number.POSITIVE_INFINITY;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) {
                continue;
            }
            common = Math.min(common, line.length - line.trimStart().length);
        }
        if (!Number.isFinite(common) || common === 0) {
            return markdown;
        }
        return lines.map((line, index) => (index === 0 ? line : line.slice(common))).join('\n');
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
     * The human-readable language-model provider name a preference declares in its schema
     * `typeDetails` (as `{ [MODEL_PROVIDER_TYPE_DETAIL]: { label } }`, see {@link ModelProviderTypeDetail}),
     * or `undefined` when none is declared. The Models page uses this to label a provider block without
     * hard-coding provider names.
     */
    modelProviderLabel(preferenceId: string): string | undefined {
        const typeDetails = this.schemaService.getSchemaProperty(preferenceId)?.typeDetails;
        const detail = typeDetails && typeof typeDetails === 'object'
            ? (typeDetails as Record<string, unknown>)[MODEL_PROVIDER_TYPE_DETAIL]
            : undefined;
        if (detail && typeof detail === 'object') {
            const label = (detail as Partial<ModelProviderTypeDetail>).label;
            if (typeof label === 'string') {
                return label;
            }
        }
        return undefined;
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
     * Whether a preference is meant to be surfaced as an editable settings row. Excludes preferences
     * that are hidden from the settings UI (`hidden: true`) and value-less placeholders (`type: 'null'`),
     * such as the backing store for agent settings or the redirect entries that only link to this view.
     */
    isDisplayable(preferenceId: string): boolean {
        const property = this.schemaService.getSchemaProperty(preferenceId);
        if (!property || property.hidden) {
            return false;
        }
        return property.type !== 'null';
    }

    /**
     * Infers a sensible {@link AiSettingsControl} for a preference from its schema `type`
     * (a `select` when it declares an `enum`). Complex values — an `object`, or an `array` of
     * objects — cannot be edited meaningfully inline, so they resolve to a `json` control that
     * defers to the `settings.json` file. Falls back to a text input for unknown types.
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
            case 'object':
                return { type: 'json' };
            case 'array':
                return this.isPrimitiveArray(property) ? { type: 'array' } : { type: 'json' };
            default:
                return { type: 'string' };
        }
    }

    /**
     * Whether an `array` preference holds primitive items (so it can be edited as a chip list) rather
     * than complex objects/arrays (which must be edited in the `settings.json` file via a `json` control).
     */
    protected isPrimitiveArray(property: PreferenceDataProperty): boolean {
        const items = property.items;
        const itemSchema = Array.isArray(items) ? items[0] : items;
        return itemSchema?.type !== 'object' && itemSchema?.type !== 'array' && !itemSchema?.properties;
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
