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

import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';

export interface AiConfigurationFilterInputProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly placeholder?: string;
}

/**
 * In-overview filter input (slot only in this iteration; wired to filtering later).
 * A controlled input so the owning widget owns the filter value.
 */
export const AiConfigurationFilterInput: React.FC<AiConfigurationFilterInputProps> = ({ value, onChange, placeholder }) => (
    <div className='ai-configuration-filter-input'>
        <span className={`ai-configuration-filter-input-icon ${codicon('filter')}`}></span>
        <input
            className='theia-input'
            type='text'
            value={value}
            placeholder={placeholder ?? nls.localizeByDefault('Filter')}
            onChange={e => onChange(e.target.value)}
        />
    </div>
);
