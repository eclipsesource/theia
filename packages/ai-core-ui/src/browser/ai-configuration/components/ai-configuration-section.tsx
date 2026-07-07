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

import * as React from '@theia/core/shared/react';

export interface AiConfigurationSectionProps {
    /** Group title. Omit for an untitled group of rows. */
    readonly title?: string;
    /** Optional short subtitle shown next to the title. */
    readonly subtitle?: string;
    readonly children: React.ReactNode;
    readonly className?: string;
}

/**
 * A titled group of settings rows in a detail page. Generalizes the earlier
 * `ConfigurationSection` and adds an optional subtitle.
 */
export const AiConfigurationSection: React.FC<AiConfigurationSectionProps> = ({ title, subtitle, children, className }) => (
    <div className={`ai-configuration-section ${className ?? ''}`}>
        {title !== undefined && <div className='ai-configuration-section-title'>
            <span className='ai-configuration-section-title-text'>{title}</span>
            {subtitle !== undefined && <span className='ai-configuration-section-subtitle'>{subtitle}</span>}
        </div>}
        <div className='ai-configuration-section-content'>
            {children}
        </div>
    </div>
);
