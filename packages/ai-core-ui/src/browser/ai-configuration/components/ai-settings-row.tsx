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

import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { AiConfigurationScope } from '../ai-configuration-category';
import { AiSettingsControl, AiSettingsRowService } from './ai-settings-row-service';
import { AiChipEditor, AiEditInSettingsButton, AiEnumSelect, AiNumberStepper, AiTextInput, AiToggleSwitch } from './ai-configuration-controls';
import { AiConfigurationSettingRow } from './ai-configuration-setting-row';

// Re-exported from its natural home on the service so existing importers keep working.
export { AiSettingsControl } from './ai-settings-row-service';

export interface AiSettingsRowProps {
    /** Service wrapping preference read/write and markdown rendering (injected by the owning widget). */
    readonly service: AiSettingsRowService;
    /** Preference id read and written by this row. */
    readonly preferenceId: string;
    /** Row label. Falls back to the preference id when omitted. */
    readonly label?: string;
    /** Optional markdown description rendered under the label. */
    readonly description?: string;
    /** Scope the row reads from and writes to (from the render context). */
    readonly scope: AiConfigurationScope;
    /** The control to render for the value. */
    readonly control: AiSettingsControl;
    /** Resource URI for `folder`-scoped preferences. */
    readonly resourceUri?: string;
    /** Called after a value is written or reset, so the owner can re-render. */
    readonly onDidChange?: () => void;
    /** Stable id used by the shell to scroll-to and flash this row after deep-search navigation. */
    readonly rowId?: string;
}

/** Control types rendered full-width below the row (they wrap or need width); the rest render inline. */
const BELOW_CONTROL_TYPES = new Set<AiSettingsControl['type']>(['array', 'string']);

/**
 * Service-driven per-setting row: reads/writes a preference id via the injected
 * {@link AiSettingsRowService} and renders through the shared {@link AiConfigurationSettingRow}, so
 * it looks identical to the hand-authored rows on the General and Models pages. The control is chosen
 * from {@link AiSettingsRowProps.control}; compact controls render inline, wide ones (chips, text)
 * render full-width below.
 */
export const AiSettingsRow: React.FC<AiSettingsRowProps> = ({
    service, preferenceId, label, description, scope, control, resourceUri, onDidChange, rowId
}) => {
    const inspection = service.inspect(preferenceId, scope, resourceUri);
    // Fall back to the (already-localized) label and description from the preference schema.
    const described = service.describe(preferenceId);
    const effectiveLabel = label ?? described.label ?? preferenceId;
    const effectiveDescription = description ?? described.description;
    // Stable identity so the description's effect does not re-render markdown on every render.
    const renderMarkdown = React.useCallback((markdown: string) => service.renderMarkdown(markdown), [service]);

    const commit = (value: unknown): void => {
        service.set(preferenceId, value, scope, resourceUri).then(() => onDidChange?.());
    };
    const reset = (): void => {
        service.reset(preferenceId, scope, resourceUri).then(() => onDidChange?.());
    };

    const controlNode = <AiSettingsRowControl
        control={control}
        value={inspection.value}
        label={effectiveLabel}
        onCommit={commit}
        onEditInSettings={() => service.editInSettings(preferenceId)}
    />;
    const below = BELOW_CONTROL_TYPES.has(control.type);

    return <AiConfigurationSettingRow
        preferenceId={rowId ?? preferenceId}
        title={effectiveLabel}
        description={effectiveDescription}
        renderMarkdown={renderMarkdown}
        modified={inspection.modified}
        onReset={reset}
        control={below ? undefined : controlNode}
        below={below ? controlNode : undefined}
    />;
};

/**
 * Renders the shared control for a schema-derived {@link AiSettingsControl}, so generically-discovered
 * preferences get the same controls as the hand-authored pages. Boolean→toggle, number→stepper,
 * enum→select, array→chip editor, object/array-of-objects→"Edit in settings.json", everything else→text.
 */
export const AiSettingsRowControl: React.FC<{
    control: AiSettingsControl;
    value: unknown;
    label: string;
    disabled?: boolean;
    onCommit: (value: unknown) => void;
    /** Invoked by the `json` control to open `settings.json` focused on the preference. */
    onEditInSettings: () => void;
}> = ({ control, value, label, disabled, onCommit, onEditInSettings }) => {
    switch (control.type) {
        case 'boolean':
            return <AiToggleSwitch checked={value === true} ariaLabel={label} disabled={disabled} onChange={onCommit} />;
        case 'select':
            return <AiEnumSelect
                value={value === undefined ? undefined : String(value)}
                ariaLabel={label}
                disabled={disabled}
                options={control.options.map(option => ({
                    value: String(option.value ?? ''),
                    label: option.label ?? String(option.value ?? ''),
                    title: option.description
                }))}
                onCommit={onCommit}
            />;
        case 'number':
            return <AiNumberStepper
                value={typeof value === 'number' ? value : (control.min ?? 0)}
                ariaLabel={label}
                min={control.min}
                max={control.max}
                disabled={disabled}
                onCommit={onCommit}
            />;
        case 'array':
            return <AiChipEditor
                values={Array.isArray(value) ? value.map(String) : []}
                addPlaceholder={control.placeholder ?? nls.localize('theia/ai/core/aiConfiguration/addValue', 'Add value…')}
                disabled={disabled}
                onChange={onCommit}
            />;
        case 'json':
            return <AiEditInSettingsButton
                label={nls.localizeByDefault('Edit in settings.json')}
                ariaLabel={label}
                disabled={disabled}
                onClick={onEditInSettings}
            />;
        case 'string':
        default:
            return <AiTextInput
                value={typeof value === 'string' ? value : ''}
                ariaLabel={label}
                placeholder={control.placeholder}
                disabled={disabled}
                onCommit={onCommit}
            />;
    }
};
