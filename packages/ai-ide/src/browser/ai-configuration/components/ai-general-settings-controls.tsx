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
import { codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';

/**
 * Presentational, DI-free controls for the AI Features (General) configuration page.
 * They mirror the "refined native preferences" mockup while reading and writing real
 * Theia preferences: each control receives the current value and an `onCommit`/`onChange`
 * callback that the owning category wires to {@link AiSettingsRowService}.
 */

/** Renders a (trusted, already-localized) markdown description via the core renderer into a managed element. */
export const AiMarkdownDescription: React.FC<{ renderMarkdown: (markdown: string) => HTMLElement; markdown: string }> = ({ renderMarkdown, markdown }) => {
    // eslint-disable-next-line no-null/no-null
    const host = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const node = host.current;
        if (!node) {
            return;
        }
        node.replaceChildren(renderMarkdown(markdown));
        return () => node.replaceChildren();
    }, [renderMarkdown, markdown]);
    return <div className='ai-general-setting-description' ref={host}></div>;
};

/** Accessible toggle switch backed by a real checkbox; `large` renders the hero-sized variant. */
export const AiToggleSwitch: React.FC<{
    checked: boolean;
    ariaLabel: string;
    disabled?: boolean;
    large?: boolean;
    onChange: (checked: boolean) => void;
}> = ({ checked, ariaLabel, disabled, large, onChange }) => (
    <label className={`ai-general-switch${large ? ' ai-general-switch-large' : ''}`}>
        <input
            type='checkbox'
            checked={checked}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={e => onChange(e.target.checked)}
        />
        <span className='ai-general-switch-track'><span className='ai-general-switch-thumb'></span></span>
    </label>
);

function clampNumber(value: number, min: number | undefined, max: number | undefined): number {
    let result = value;
    if (min !== undefined) {
        result = Math.max(min, result);
    }
    if (max !== undefined) {
        result = Math.min(max, result);
    }
    return result;
}

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
    return <span className='ai-general-stepper-wrap'>
        <span className='ai-general-stepper'>
            <button
                type='button'
                className='ai-general-stepper-button'
                aria-label={nls.localize('theia/ai/ide/generalConfiguration/decrease', 'Decrease')}
                disabled={disabled || (min !== undefined && value <= min)}
                onClick={() => step(-1)}
            >−</button>
            <input
                className='ai-general-stepper-input'
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
                className='ai-general-stepper-button'
                aria-label={nls.localize('theia/ai/ide/generalConfiguration/increase', 'Increase')}
                disabled={disabled || (max !== undefined && value >= max)}
                onClick={() => step(1)}
            >+</button>
        </span>
        {unit && <span className='ai-general-unit-hint'>{unit}</span>}
    </span>;
};

/**
 * A chip/tag editor over a `string[]` preference: Enter on the input adds a chip, Backspace on an
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
        className='ai-general-chips'
        onClick={() => inputRef.current?.focus()}
    >
        {values.map((value, index) => <span className='ai-general-chip' key={`${value}-${index}`}>
            <span className='ai-general-chip-label'>{value}</span>
            <button
                type='button'
                className={`ai-general-chip-remove ${codicon('close')}`}
                aria-label={nls.localizeByDefault('Remove {0}', value)}
                disabled={disabled}
                onClick={e => { e.stopPropagation(); removeAt(index); }}
            ></button>
        </span>)}
        <input
            ref={inputRef}
            className='ai-general-chip-input'
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
    return <div className='ai-general-path-row'>
        <input
            className='theia-input ai-general-path-input'
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

/** A native, theme-styled select over a fixed set of options; commits the selected value. */
export const AiEnumSelect: React.FC<{
    value: string | undefined;
    options: { value: string; label: string }[];
    ariaLabel: string;
    disabled?: boolean;
    onCommit: (value: string) => void;
}> = ({ value, options, ariaLabel, disabled, onCommit }) => (
    <select
        className='ai-general-select'
        aria-label={ariaLabel}
        value={value ?? ''}
        disabled={disabled}
        onChange={e => onCommit(e.target.value)}
    >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
);

/** A single non-"Limited" choice for {@link AiSessionLimitControl}, mapping a label to its magic preference value. */
export interface SessionLimitSpecialOption {
    readonly value: number;
    readonly label: string;
}

const LIMITED_OPTION_KEY = '__limited__';

/**
 * A select mapping a numeric session-limit preference's special values (e.g. -1 = unlimited, 0 = disabled)
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
    return <span className='ai-general-session-limit'>
        <select
            className='ai-general-select'
            aria-label={ariaLabel}
            value={selectValue}
            disabled={disabled}
            onChange={e => onSelect(e.target.value)}
        >
            <option value={LIMITED_OPTION_KEY}>{limitedLabel}</option>
            {specials.map(special => <option key={special.value} value={String(special.value)}>{special.label}</option>)}
        </select>
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
