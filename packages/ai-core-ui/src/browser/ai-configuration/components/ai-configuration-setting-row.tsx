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
import { AiMarkdownDescription } from './ai-markdown-description';

export interface AiConfigurationSettingRowProps {
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
    /** Full-width control shown below the row (e.g. a chip editor or a path input). */
    readonly below?: React.ReactNode;
}

/**
 * Presentational per-setting row shared across every AI configuration page: title with the real
 * preference id, the schema description, a control (inline via {@link AiConfigurationSettingRowProps.control}
 * or full-width via {@link AiConfigurationSettingRowProps.below}), and — when the value is overridden
 * in the current scope — a modified edge and a hover-revealed reset. It is DI-free; owners supply the
 * values, a bound markdown renderer and the reset callback.
 */
export const AiConfigurationSettingRow: React.FC<AiConfigurationSettingRowProps> = ({
    preferenceId, title, description, renderMarkdown, modified, disabled, onReset, control, below
}) => (
    <div className={`ai-settings-row${modified ? ' modified' : ''}`} data-ai-config-row-id={preferenceId}>
        <div className='ai-settings-row-top'>
            <div className='ai-settings-row-main'>
                <div className='ai-settings-row-title'>
                    {title}
                    <span className='ai-settings-row-id'>{preferenceId}</span>
                </div>
                {description && <AiMarkdownDescription renderMarkdown={renderMarkdown} markdown={description} />}
            </div>
            <div className='ai-settings-row-control'>
                {modified && <button
                    type='button'
                    className='ai-settings-row-reset'
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
        {below && <div className='ai-settings-row-below'>{below}</div>}
    </div>
);
