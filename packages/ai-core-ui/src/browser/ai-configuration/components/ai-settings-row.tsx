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
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { AiConfigurationScope } from '../ai-configuration-category';
import { AiSettingsRowService } from './ai-settings-row-service';

/** Describes which control the {@link AiSettingsRow} renders for a preference value. */
export type AiSettingsControl =
    | { readonly type: 'boolean' }
    | { readonly type: 'string'; readonly placeholder?: string }
    | { readonly type: 'number'; readonly min?: number; readonly max?: number; readonly step?: number }
    | { readonly type: 'select'; readonly options: SelectOption[] }
    | { readonly type: 'array'; readonly placeholder?: string };

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

    const commit = (value: unknown): void => {
        service.set(preferenceId, value, scope, resourceUri).then(() => onDidChange?.());
    };
    const reset = (): void => {
        service.reset(preferenceId, scope, resourceUri).then(() => onDidChange?.());
    };

    return <div className='ai-settings-row' data-ai-config-row-id={rowId}>
        <div className='ai-settings-row-header'>
            <span className='ai-settings-row-label'>{label ?? preferenceId}</span>
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
        {description && <AiSettingsRowDescription service={service} description={description} />}
        <div className='ai-settings-row-control'>
            <AiSettingsRowControl control={control} value={inspection.value} onCommit={commit} />
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

const AiSettingsRowControl: React.FC<{ control: AiSettingsControl; value: unknown; onCommit: (value: unknown) => void }> = ({ control, value, onCommit }) => {
    switch (control.type) {
        case 'boolean':
            return <input
                className='ai-settings-row-toggle'
                type='checkbox'
                checked={value === true}
                onChange={e => onCommit(e.target.checked)}
            />;
        case 'select': {
            const current = value === undefined ? undefined : String(value);
            return <SelectComponent
                className='ai-settings-row-select'
                options={control.options}
                defaultValue={current}
                onChange={option => onCommit(option.value)}
            />;
        }
        case 'number':
            return <AiSettingsNumberInput value={value} control={control} onCommit={onCommit} />;
        case 'array':
            return <AiSettingsArrayInput value={value} placeholder={control.placeholder} onCommit={onCommit} />;
        case 'string':
        default:
            return <AiSettingsTextInput value={value} placeholder={control.placeholder} onCommit={onCommit} />;
    }
};

/** Text input committing on blur or Enter, so typing does not write a preference per keystroke. */
const AiSettingsTextInput: React.FC<{ value: unknown; placeholder?: string; onCommit: (value: string) => void }> = ({ value, placeholder, onCommit }) => {
    const initial = typeof value === 'string' ? value : '';
    const [draft, setDraft] = React.useState(initial);
    React.useEffect(() => setDraft(initial), [initial]);
    const commitIfChanged = (): void => {
        if (draft !== initial) {
            onCommit(draft);
        }
    };
    return <input
        className='theia-input ai-settings-row-input'
        type='text'
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitIfChanged}
        onKeyDown={e => { if (e.key === 'Enter') { commitIfChanged(); } }}
    />;
};

const AiSettingsNumberInput: React.FC<{
    value: unknown;
    control: { min?: number; max?: number; step?: number };
    onCommit: (value: number | undefined) => void;
}> = ({ value, control, onCommit }) => {
    const initial = typeof value === 'number' ? String(value) : '';
    const [draft, setDraft] = React.useState(initial);
    React.useEffect(() => setDraft(initial), [initial]);
    const commitIfChanged = (): void => {
        if (draft === initial) {
            return;
        }
        const parsed = Number(draft);
        onCommit(draft.trim() === '' || Number.isNaN(parsed) ? undefined : parsed);
    };
    return <input
        className='theia-input ai-settings-row-input'
        type='number'
        value={draft}
        min={control.min}
        max={control.max}
        step={control.step}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitIfChanged}
        onKeyDown={e => { if (e.key === 'Enter') { commitIfChanged(); } }}
    />;
};

/** A comma-separated editor over a string array, kept simple until a richer chip editor is needed. */
const AiSettingsArrayInput: React.FC<{ value: unknown; placeholder?: string; onCommit: (value: string[]) => void }> = ({ value, placeholder, onCommit }) => {
    const initial = Array.isArray(value) ? value.map(String).join(', ') : '';
    const [draft, setDraft] = React.useState(initial);
    React.useEffect(() => setDraft(initial), [initial]);
    const commitIfChanged = (): void => {
        if (draft === initial) {
            return;
        }
        const entries = draft.split(',').map(entry => entry.trim()).filter(entry => entry.length > 0);
        onCommit(entries);
    };
    return <input
        className='theia-input ai-settings-row-input'
        type='text'
        value={draft}
        placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitIfChanged}
        onKeyDown={e => { if (e.key === 'Enter') { commitIfChanged(); } }}
    />;
};
