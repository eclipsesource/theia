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

import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { AiConfigurationScope } from '../ai-configuration-category';
import { AiSettingsControl, AiSettingsRowService } from './ai-settings-row-service';
import { AiChipEditor, AiEnumSelect, AiNumberStepper, AiTextInput, AiToggleSwitch } from './ai-configuration-controls';

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

/**
 * Lightweight per-setting row: label, optional markdown description, a modified
 * indicator plus reset (shown when the scope overrides the value), and a control
 * chosen by {@link AiSettingsRowProps.control}.
 */
export const AiSettingsRow: React.FC<AiSettingsRowProps> = ({
    service, preferenceId, label, description, scope, control, resourceUri, onDidChange, rowId
}) => {
    const inspection = service.inspect(preferenceId, scope, resourceUri);
    // Fall back to the (already-localized) label and description from the preference schema.
    const described = service.describe(preferenceId);
    const effectiveLabel = label ?? described.label;
    const effectiveDescription = description ?? described.description;

    const commit = (value: unknown): void => {
        service.set(preferenceId, value, scope, resourceUri).then(() => onDidChange?.());
    };
    const reset = (): void => {
        service.reset(preferenceId, scope, resourceUri).then(() => onDidChange?.());
    };

    return <div className='ai-settings-row' data-ai-config-row-id={rowId ?? preferenceId}>
        <div className='ai-settings-row-header'>
            <span className='ai-settings-row-label'>{effectiveLabel ?? preferenceId}</span>
            {inspection.modified && <>
                <span className='ai-settings-row-modified'>
                    {nls.localize('theia/ai/core/aiConfiguration/modifiedInScope', 'Modified in: {0}', scope)}
                </span>
                <button
                    className={`ai-settings-row-reset ${codicon('discard')}`}
                    title={nls.localizeByDefault('Reset Setting')}
                    onClick={reset}
                ></button>
            </>}
        </div>
        {effectiveDescription && <AiSettingsRowDescription service={service} description={effectiveDescription} />}
        <div className='ai-settings-row-control'>
            <AiSettingsRowControl control={control} value={inspection.value} label={effectiveLabel ?? preferenceId} onCommit={commit} />
        </div>
    </div>;
};

/** Renders the (trusted) markdown description via the core renderer into a managed element. */
const AiSettingsRowDescription: React.FC<{ service: AiSettingsRowService; description: string }> = ({ service, description }) => {
    // eslint-disable-next-line no-null/no-null
    const host = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const node = host.current;
        if (!node) {
            return;
        }
        const rendered = service.renderMarkdown(description);
        node.replaceChildren(rendered);
        return () => node.replaceChildren();
    }, [service, description]);
    return <div className='ai-settings-row-description' ref={host}></div>;
};

const AiSettingsRowControl: React.FC<{ control: AiSettingsControl; value: unknown; label: string; onCommit: (value: unknown) => void }> = ({ control, value, label, onCommit }) => {
    switch (control.type) {
        case 'boolean':
            return <AiToggleSwitch checked={value === true} ariaLabel={label} onChange={onCommit} />;
        case 'select':
            return <AiEnumSelect
                value={value === undefined ? undefined : String(value)}
                ariaLabel={label}
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
                onCommit={onCommit}
            />;
        case 'array':
            return <AiChipEditor
                values={Array.isArray(value) ? value.map(String) : []}
                addPlaceholder={control.placeholder ?? nls.localize('theia/ai/core/aiConfiguration/addValue', 'Add value…')}
                onChange={onCommit}
            />;
        case 'string':
        default:
            return <AiTextInput
                value={typeof value === 'string' ? value : ''}
                ariaLabel={label}
                placeholder={control.placeholder}
                onCommit={onCommit}
            />;
    }
};
