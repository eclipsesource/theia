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

import {
    NotificationType,
    NOTIFICATION_TYPES,
    NOTIFICATION_TYPE_LABELS,
    NOTIFICATION_TYPE_DESCRIPTIONS,
} from '@theia/ai-core/lib/common';
import { nls } from '@theia/core';
import { SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import * as React from '@theia/core/shared/react';
import { AiEnumSelect } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';

export interface AgentNotificationSettingsProps {
    agentId: string;
    currentNotificationType?: NotificationType;
    onNotificationTypeChange: (agentId: string, notificationType: NotificationType | undefined) => Promise<void>;
    onOpenNotificationSettings: () => void;
}

const DEFAULT_VALUE = 'default';

const NOTIFICATION_SELECT_OPTIONS: SelectOption[] = [
    {
        value: DEFAULT_VALUE,
        label: nls.localizeByDefault('Default'),
        description: nls.localize('theia/ai/core/agentConfiguration/defaultNotificationDescription',
            'Uses the global AI notification setting'),
    },
    ...NOTIFICATION_TYPES.map(type => ({
        value: type,
        label: NOTIFICATION_TYPE_LABELS[type],
        description: NOTIFICATION_TYPE_DESCRIPTIONS[type],
    })),
];

export const AgentNotificationSettings = ({ agentId, currentNotificationType, onNotificationTypeChange, onOpenNotificationSettings }: AgentNotificationSettingsProps) => {
    const handleChange = (value: string): void => {
        const notificationType = value === DEFAULT_VALUE ? undefined : value as NotificationType;
        onNotificationTypeChange(agentId, notificationType);
    };

    return (
        <div className="ai-llm-requirement-item">
            <div className="ai-configuration-value-row">
                <label className="ai-configuration-value-row-label">
                    {nls.localizeByDefault('Notifications')}:
                </label>
                <AiEnumSelect
                    ariaLabel={nls.localizeByDefault('Notifications')}
                    className="ai-configuration-value-row-value"
                    options={NOTIFICATION_SELECT_OPTIONS.map(option => ({
                        value: String(option.value ?? ''),
                        label: option.label ?? String(option.value ?? ''),
                        title: option.description
                    }))}
                    value={currentNotificationType ?? DEFAULT_VALUE}
                    onCommit={handleChange}
                />
            </div>
            <NotificationDescription onOpenNotificationSettings={onOpenNotificationSettings} />
        </div>
    );
};

const NotificationDescription = ({ onOpenNotificationSettings }: { onOpenNotificationSettings: () => void }): React.ReactElement => {
    const linkText = nls.localize('theia/ai/core/agentConfiguration/notificationSettingsLink', 'AI notification setting');
    return (
        <div className="ai-configuration-description">
            {nls.localize('theia/ai/core/agentConfiguration/completionNotificationDescriptionPrefix',
                'Select how you want to be notified when this agent needs your attention, i.e. it completes its task or requests your input. "Default" uses the ')}
            <a href="#" onClick={e => { e.preventDefault(); onOpenNotificationSettings(); }}>{linkText}</a>.
        </div>
    );
};
