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

export interface AiConfigurationItemDetailHeaderProps {
    readonly title: string;
    /** `codicon(...)` class shown before the title. */
    readonly iconClass?: string;
    /** Secondary line under the title (e.g. an id or provider). */
    readonly subtitle?: string;
    /** Trailing slot for header actions and toggles (buttons, switches). */
    readonly actions?: React.ReactNode;
}

/** Header of a collection item's detail page: icon, title, subtitle and an actions slot. */
export const AiConfigurationItemDetailHeader: React.FC<AiConfigurationItemDetailHeaderProps> = ({ title, iconClass, subtitle, actions }) => (
    <div className='ai-configuration-item-detail-header'>
        <div className='ai-configuration-item-detail-header-heading'>
            {iconClass && <span className={`ai-configuration-item-detail-header-icon ${iconClass}`}></span>}
            <div className='ai-configuration-item-detail-header-titles'>
                <span className='ai-configuration-item-detail-header-title'>{title}</span>
                {subtitle !== undefined && <span className='ai-configuration-item-detail-header-subtitle'>{subtitle}</span>}
            </div>
        </div>
        {actions !== undefined && <div className='ai-configuration-item-detail-header-actions'>{actions}</div>}
    </div>
);
