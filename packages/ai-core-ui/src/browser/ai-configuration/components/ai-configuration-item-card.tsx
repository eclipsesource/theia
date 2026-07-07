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
import { AiConfigurationItemStatus } from '../ai-configuration-category';

export interface AiConfigurationItemCardProps {
    readonly label: string;
    /** `codicon(...)` class shown in the card corner. */
    readonly iconClass?: string;
    readonly description?: string;
    /** Small status dot in the card corner. */
    readonly status?: AiConfigurationItemStatus;
    /** Invoked when the card is clicked or activated via keyboard; typically `ctx.navigate(...)`. */
    readonly onSelect: () => void;
}

/**
 * Overview card for a collection item: icon, label, description and a status dot.
 * Clicking (or pressing Enter/Space on) the card selects the item.
 */
export const AiConfigurationItemCard: React.FC<AiConfigurationItemCardProps> = ({ label, iconClass, description, status, onSelect }) => {
    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect();
        }
    };
    return <div className='ai-configuration-item-card' role='button' tabIndex={0} onClick={onSelect} onKeyDown={onKeyDown}>
        <div className='ai-configuration-item-card-header'>
            {iconClass && <span className={`ai-configuration-item-card-icon ${iconClass}`}></span>}
            <span className='ai-configuration-item-card-label'>{label}</span>
            {status && <span
                className={`ai-configuration-status ai-configuration-status-${status.kind}`}
                title={status.tooltip}
            ></span>}
        </div>
        {description && <div className='ai-configuration-item-card-description'>{description}</div>}
    </div>;
};
