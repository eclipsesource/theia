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

export interface AiConfigurationStatusBadgeProps {
    readonly status: AiConfigurationItemStatus;
}

/**
 * Labeled status affordance: a colored dot paired with its text label, so the
 * state is legible at a glance rather than encoded in color alone. The full
 * detail (if any) stays on hover.
 */
export const AiConfigurationStatusBadge: React.FC<AiConfigurationStatusBadgeProps> = ({ status }) => (
    <span className='ai-configuration-status-badge' title={status.tooltip ?? status.label}>
        <span className={`ai-configuration-status ai-configuration-status-${status.kind}`} aria-hidden={true}></span>
        <span className='ai-configuration-status-badge-label'>{status.label}</span>
    </span>
);
