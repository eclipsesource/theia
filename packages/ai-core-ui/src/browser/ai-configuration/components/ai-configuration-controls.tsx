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

import { nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';

/**
 * Presentational, DI-free form controls shared across the AI configuration pages so that a given
 * logical control (a toggle, a text input, a select, a numeric stepper, a chip/tag editor) looks
 * and behaves the same regardless of which category renders it. Owners pass in the current value
 * and an `onChange`/`onCommit` callback; controls that edit free text commit on blur/Enter so that
 * typing does not write a preference per keystroke.
 *
 * All classes are prefixed `ai-config-` and are styled in `ai-configuration-components.css`.
 */

export function clampNumber(value: number, min: number | undefined, max: number | undefined): number {
    let result = value;
    if (min !== undefined) {
        result = Math.max(min, result);
    }
    if (max !== undefined) {
        result = Math.min(max, result);
    }
    return result;
}

/** Accessible toggle switch backed by a real checkbox; `large` renders the hero-sized variant. */
export const AiToggleSwitch: React.FC<{
    checked: boolean;
    ariaLabel: string;
    disabled?: boolean;
    large?: boolean;
    onChange: (checked: boolean) => void;
}> = ({ checked, ariaLabel, disabled, large, onChange }) => (
    <label className={`ai-config-switch${large ? ' ai-config-switch-large' : ''}`}>
        <input
            type='checkbox'
            checked={checked}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={e => onChange(e.target.checked)}
        />
        <span className='ai-config-switch-track'><span className='ai-config-switch-thumb'></span></span>
    </label>
);

/** Single-line text input committing on blur or Enter (so typing does not write a preference per keystroke). */
export const AiTextInput: React.FC<{
    value: string;
    ariaLabel: string;
    placeholder?: string;
    disabled?: boolean;
    monospace?: boolean;
    onCommit: (value: string) => void;
}> = ({ value, ariaLabel, placeholder, disabled, monospace, onCommit }) => {
    const [draft, setDraft] = React.useState(value);
    React.useEffect(() => setDraft(value), [value]);
    const commitIfChanged = (): void => {
        if (draft !== value) {
            onCommit(draft);
        }
    };
    return <input
        className={`theia-input ai-config-input${monospace ? ' ai-config-input-mono' : ''}`}
        type='text'
        value={draft}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitIfChanged}
        onKeyDown={e => { if (e.key === 'Enter') { commitIfChanged(); } }}
    />;
};

/** A `− value +` numeric stepper. Commits on blur/Enter (typing) and immediately on the buttons. */
export const AiNumberStepper: React.FC<{
    value: number;
    ariaLabel: string;
    min?: number;
    max?: number;
    unit?: string;
    disabled?: boolean;
    onCommit: (value: number) => void;
}> = ({ value, ariaLabel, min, max, unit, disabled, onCommit }) => {
    const [draft, setDraft] = React.useState(String(value));
    React.useEffect(() => setDraft(String(value)), [value]);
    const commitDraft = (): void => {
        const parsed = Number(draft);
        const next = clampNumber(Number.isNaN(parsed) ? value : Math.round(parsed), min, max);
        setDraft(String(next));
        if (next !== value) {
            onCommit(next);
        }
    };
    const step = (delta: number): void => {
        const next = clampNumber(value + delta, min, max);
        if (next !== value) {
            onCommit(next);
        }
    };
    return <span className='ai-config-stepper-wrap'>
        <span className='ai-config-stepper'>
            <button
                type='button'
                className='ai-config-stepper-button'
                aria-label={nls.localize('theia/ai/core/aiConfiguration/decrease', 'Decrease')}
                disabled={disabled || (min !== undefined && value <= min)}
                onClick={() => step(-1)}
            >−</button>
            <input
                className='ai-config-stepper-input'
                inputMode='numeric'
                aria-label={ariaLabel}
                value={draft}
                disabled={disabled}
                onChange={e => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={e => { if (e.key === 'Enter') { commitDraft(); } }}
            />
            <button
                type='button'
                className='ai-config-stepper-button'
                aria-label={nls.localize('theia/ai/core/aiConfiguration/increase', 'Increase')}
                disabled={disabled || (max !== undefined && value >= max)}
                onClick={() => step(1)}
            >+</button>
        </span>
        {unit && <span className='ai-config-unit-hint'>{unit}</span>}
    </span>;
};

/**
 * A chip/tag editor over a `string[]` value: Enter on the input adds a chip, Backspace on an
 * empty input removes the last chip, and each chip has a keyboard-focusable remove button.
 */
export const AiChipEditor: React.FC<{
    values: string[];
    addPlaceholder: string;
    disabled?: boolean;
    onChange: (values: string[]) => void;
}> = ({ values, addPlaceholder, disabled, onChange }) => {
    const [draft, setDraft] = React.useState('');
    // eslint-disable-next-line no-null/no-null
    const inputRef = React.useRef<HTMLInputElement>(null);
    const addChip = (): void => {
        const entry = draft.trim();
        if (entry && !values.includes(entry)) {
            onChange([...values, entry]);
        }
        setDraft('');
    };
    const removeAt = (index: number): void => onChange(values.filter((_, i) => i !== index));
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter' && draft.trim()) {
            e.preventDefault();
            addChip();
        } else if (e.key === 'Backspace' && !draft && values.length > 0) {
            removeAt(values.length - 1);
        }
    };
    return <div
        className='ai-config-chips'
        onClick={() => inputRef.current?.focus()}
    >
        {values.map((value, index) => <span className='ai-config-chip' key={`${value}-${index}`}>
            <span className='ai-config-chip-label'>{value}</span>
            <button
                type='button'
                className={`ai-config-chip-remove ${codicon('close')}`}
                aria-label={nls.localizeByDefault('Remove {0}', value)}
                disabled={disabled}
                onClick={e => { e.stopPropagation(); removeAt(index); }}
            ></button>
        </span>)}
        <input
            ref={inputRef}
            className='ai-config-chip-input'
            placeholder={addPlaceholder}
            aria-label={addPlaceholder}
            value={draft}
            disabled={disabled}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => { if (draft.trim()) { addChip(); } }}
        />
    </div>;
};

/** A monospace path input plus a "Browse…" button that delegates folder selection to `onBrowse`. */
export const AiPathInput: React.FC<{
    value: string;
    placeholder: string;
    browseLabel: string;
    disabled?: boolean;
    onCommit: (value: string) => void;
    onBrowse: () => Promise<string | undefined>;
}> = ({ value, placeholder, browseLabel, disabled, onCommit, onBrowse }) => {
    const [draft, setDraft] = React.useState(value);
    React.useEffect(() => setDraft(value), [value]);
    const commitDraft = (): void => {
        if (draft !== value) {
            onCommit(draft);
        }
    };
    const browse = (): void => {
        onBrowse().then(picked => {
            if (picked !== undefined) {
                setDraft(picked);
                onCommit(picked);
            }
        });
    };
    return <div className='ai-config-path-row'>
        <input
            className='theia-input ai-config-input ai-config-input-mono'
            type='text'
            value={draft}
            placeholder={placeholder}
            disabled={disabled}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={e => { if (e.key === 'Enter') { commitDraft(); } }}
        />
        <button type='button' className='theia-button secondary' disabled={disabled} onClick={browse}>{browseLabel}</button>
    </div>;
};

/**
 * A button that hands editing off to the `settings.json` file. Used for preferences whose value is a
 * complex object (or array of objects) that cannot be edited meaningfully through an inline control;
 * clicking it opens `settings.json` focused on the preference, mirroring the Settings view's
 * "Edit in settings.json" link.
 */
export const AiEditInSettingsButton: React.FC<{
    label: string;
    ariaLabel: string;
    disabled?: boolean;
    onClick: () => void;
}> = ({ label, ariaLabel, disabled, onClick }) => (
    <button
        type='button'
        className='theia-button secondary ai-config-edit-in-settings'
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
    >
        <span className={codicon('edit')}></span>
        {label}
    </button>
);

/** A single option for {@link AiEnumSelect}. */
export interface AiEnumOption {
    readonly value: string;
    readonly label: string;
    /** Optional native tooltip, e.g. to surface an option's secondary description. */
    readonly title?: string;
    readonly disabled?: boolean;
}

/** A native, theme-styled select over a fixed set of options; commits the selected value. */
export const AiEnumSelect: React.FC<{
    value: string | undefined;
    options: AiEnumOption[];
    ariaLabel: string;
    className?: string;
    disabled?: boolean;
    invalid?: boolean;
    onCommit: (value: string) => void;
}> = ({ value, options, ariaLabel, className, disabled, invalid, onCommit }) => (
    <select
        className={`ai-config-select${invalid ? ' error' : ''}${className ? ' ' + className : ''}`}
        aria-label={ariaLabel}
        value={value ?? ''}
        disabled={disabled}
        onChange={e => onCommit(e.target.value)}
    >
        {options.map(option => <option key={option.value} value={option.value} title={option.title} disabled={option.disabled}>{option.label}</option>)}
    </select>
);

/** A single non-"Limited" choice for {@link AiSessionLimitControl}, mapping a label to its magic value. */
export interface SessionLimitSpecialOption {
    readonly value: number;
    readonly label: string;
}

const LIMITED_OPTION_KEY = '__limited__';

/**
 * A select mapping a numeric session-limit value's special values (e.g. -1 = unlimited, 0 = disabled)
 * to explicit labelled options, with a numeric stepper shown only while the "Limited" option is selected.
 */
export const AiSessionLimitControl: React.FC<{
    value: number;
    limitedLabel: string;
    limitedDefault: number;
    limitedMin: number;
    limitedMax?: number;
    unit: string;
    specials: SessionLimitSpecialOption[];
    ariaLabel: string;
    disabled?: boolean;
    onCommit: (value: number) => void;
}> = ({ value, limitedLabel, limitedDefault, limitedMin, limitedMax, unit, specials, ariaLabel, disabled, onCommit }) => {
    const activeSpecial = specials.find(special => special.value === value);
    const selectValue = activeSpecial ? String(activeSpecial.value) : LIMITED_OPTION_KEY;
    const onSelect = (next: string): void => {
        if (next === LIMITED_OPTION_KEY) {
            if (activeSpecial) {
                onCommit(clampNumber(limitedDefault, limitedMin, limitedMax));
            }
        } else {
            onCommit(Number(next));
        }
    };
    return <span className='ai-config-session-limit'>
        <AiEnumSelect
            value={selectValue}
            ariaLabel={ariaLabel}
            disabled={disabled}
            options={[
                { value: LIMITED_OPTION_KEY, label: limitedLabel },
                ...specials.map(special => ({ value: String(special.value), label: special.label }))
            ]}
            onCommit={onSelect}
        />
        {!activeSpecial && <AiNumberStepper
            value={clampNumber(value, limitedMin, limitedMax)}
            ariaLabel={ariaLabel}
            min={limitedMin}
            max={limitedMax}
            unit={unit}
            disabled={disabled}
            onCommit={onCommit}
        />}
    </span>;
};
