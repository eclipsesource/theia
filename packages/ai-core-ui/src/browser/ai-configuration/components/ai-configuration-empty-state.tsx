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

import * as React from '@theia/core/shared/react';

export interface AiConfigurationEmptyStateProps {
    readonly message: string;
    /** `codicon(...)` class shown above the message. */
    readonly iconClass?: string;
    /** Optional call-to-action rendered under the message (e.g. an add button). */
    readonly action?: React.ReactNode;
    readonly className?: string;
}

/** Placeholder shown when a collection has no items or a filter matches nothing. */
export const AiConfigurationEmptyState: React.FC<AiConfigurationEmptyStateProps> = ({ message, iconClass, action, className }) => (
    <div className={`ai-configuration-empty-state ${className ?? ''}`}>
        {iconClass && <span className={`ai-configuration-empty-state-icon ${iconClass}`}></span>}
        <span className='ai-configuration-empty-state-message'>{message}</span>
        {action !== undefined && <div className='ai-configuration-empty-state-action'>{action}</div>}
    </div>
);
