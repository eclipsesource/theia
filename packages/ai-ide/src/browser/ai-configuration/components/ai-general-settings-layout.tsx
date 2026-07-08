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
import { AiSettingsControl } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import {
    AiChipEditor,
    AiEditInSettingsButton,
    AiEnumSelect,
    AiMarkdownDescription,
    AiNumberStepper,
    AiTextInput,
    AiToggleSwitch
} from './ai-general-settings-controls';

/**
 * Shared presentational layout for the "AI Features"-style configuration pages (General and Models).
 * These components own the page frame — sticky header, sections and per-setting rows — so the pages
 * render with one consistent look. They are DI-free: owners pass in the values, a bound markdown
 * renderer and the commit/reset callbacks (wired to `AiSettingsRowService`).
 */

/** Sticky page header: breadcrumb trail (last crumb emphasized), title and optional subtitle. */
export const AiGeneralPageHeader: React.FC<{ crumbs: string[]; title: string; subtitle?: string }> = ({ crumbs, title, subtitle }) => (
    <div className='ai-general-head'>
        <div className='ai-general-crumbs'>
            {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1;
                return <React.Fragment key={`${crumb}-${index}`}>
                    {index > 0 && <span className={`ai-general-crumbs-sep ${codicon('chevron-right')}`}></span>}
                    {last ? <b>{crumb}</b> : <span>{crumb}</span>}
                </React.Fragment>;
            })}
        </div>
        <h1 className='ai-general-head-title'>{title}</h1>
        {subtitle && <p className='ai-general-head-subtitle'>{subtitle}</p>}
    </div>
);

/** A titled settings section (heading with an underline plus its rows). */
export const AiGeneralSection: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
    <div className='ai-general-section'>
        <h2 className='ai-general-section-title'>{title}</h2>
        {children}
    </div>
);

export interface AiGeneralSettingRowProps {
    /** Preference id; shown inline next to the title and used as the deep-link anchor. */
    readonly preferenceId: string;
    /** Human-readable setting title. */
    readonly title: string;
    /** Optional already-localized markdown description rendered under the title. */
    readonly description?: string;
    /** Bound markdown renderer (stable identity for the description's effect). */
    readonly renderMarkdown: (markdown: string) => HTMLElement;
    /** `true` when the value is overridden in the current scope; reveals the modified edge and reset. */
    readonly modified: boolean;
    /** Disables the reset affordance (e.g. while the page is gated off). */
    readonly disabled?: boolean;
    /** Clears the override in the current scope. */
    readonly onReset: () => void;
    /** Inline control shown on the right of the row. */
    readonly control?: React.ReactNode;
    /** Full-width control shown below the row (e.g. a path input). */
    readonly below?: React.ReactNode;
}

/**
 * One setting row: title with the real preference id, the schema description, a control (inline via
 * {@link AiGeneralSettingRowProps.control} or full-width via {@link AiGeneralSettingRowProps.below}),
 * and — when the value is overridden in the current scope — a modified edge and a hover reset.
 */
export const AiGeneralSettingRow: React.FC<AiGeneralSettingRowProps> = ({
    preferenceId, title, description, renderMarkdown, modified, disabled, onReset, control, below
}) => (
    <div className={`ai-general-setting${modified ? ' modified' : ''}`} data-ai-config-row-id={preferenceId}>
        <div className='ai-general-setting-top'>
            <div className='ai-general-setting-main'>
                <div className='ai-general-setting-title'>
                    {title}
                    <span className='ai-general-setting-id'>{preferenceId}</span>
                </div>
                {description && <AiMarkdownDescription renderMarkdown={renderMarkdown} markdown={description} />}
            </div>
            <div className='ai-general-setting-ctrl'>
                {modified && <button
                    type='button'
                    className='ai-general-reset'
                    title={nls.localizeByDefault('Reset Setting')}
                    disabled={disabled}
                    onClick={onReset}
                >
                    <span className={codicon('discard')}></span>
                    {nls.localizeByDefault('Reset')}
                </button>}
                {control}
            </div>
        </div>
        {below && <div className='ai-general-setting-below'>{below}</div>}
    </div>
);

/**
 * Renders the AI-Features-styled control for a schema-derived {@link AiSettingsControl}, so
 * generically-discovered preferences (e.g. the Models providers) get the same controls as the
 * hand-authored General page.
 */
export const AiGeneralSettingControl: React.FC<{
    control: AiSettingsControl;
    value: unknown;
    ariaLabel: string;
    disabled?: boolean;
    onCommit: (value: unknown) => void;
    /** Invoked by the `json` control to open the Settings UI for complex object/array values. */
    onEditInSettings?: () => void;
}> = ({ control, value, ariaLabel, disabled, onCommit, onEditInSettings }) => {
    switch (control.type) {
        case 'boolean':
            return <AiToggleSwitch checked={value === true} ariaLabel={ariaLabel} disabled={disabled} onChange={onCommit} />;
        case 'number':
            return <AiNumberStepper
                value={typeof value === 'number' ? value : (control.min ?? 0)}
                ariaLabel={ariaLabel}
                min={control.min}
                max={control.max}
                disabled={disabled}
                onCommit={onCommit}
            />;
        case 'select':
            return <AiEnumSelect
                value={value === undefined ? undefined : String(value)}
                options={control.options.map(option => ({ value: option.value ?? '', label: option.label ?? option.value ?? '' }))}
                ariaLabel={ariaLabel}
                disabled={disabled}
                onCommit={onCommit}
            />;
        case 'array':
            return <AiChipEditor
                values={Array.isArray(value) ? value.map(String) : []}
                addPlaceholder={nls.localize('theia/ai/ide/generalConfiguration/addValue', 'Add value…')}
                disabled={disabled}
                onChange={onCommit}
            />;
        case 'json':
            return <AiEditInSettingsButton
                label={nls.localize('theia/ai/ide/generalConfiguration/editInSettings', 'Edit in settings')}
                ariaLabel={ariaLabel}
                disabled={disabled || !onEditInSettings}
                onClick={onEditInSettings ?? (() => { })}
            />;
        case 'string':
        default:
            return <AiTextInput
                value={typeof value === 'string' ? value : ''}
                ariaLabel={ariaLabel}
                placeholder={control.type === 'string' ? control.placeholder : undefined}
                disabled={disabled}
                onCommit={onCommit}
            />;
    }
};
