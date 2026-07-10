// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { DisposableCollection, Emitter, Event, ILogger, RecursiveReadonly } from '@theia/core';
import { PreferenceScope } from '@theia/core/lib/common/preferences';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AiConfigurationInspection, AiConfigurationService, AISettings, AISettingsService, AgentSettings } from '../common';

@injectable()
export class AISettingsServiceImpl implements AISettingsService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    static readonly PREFERENCE_NAME = 'ai-features.agentSettings';

    protected toDispose = new DisposableCollection();

    protected readonly onDidChangeEmitter = new Emitter<void>();
    onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(
            this.aiConfigurationService.onDidChange(change => {
                if (change.affectsPreference(AISettingsServiceImpl.PREFERENCE_NAME)) {
                    this.onDidChangeEmitter.fire();
                }
            })
        );
    }

    async updateAgentSettings(agent: string, agentSettings: Partial<AgentSettings>, scope?: PreferenceScope, resourceUri?: string): Promise<void> {
        // Base the write on the settings effective at the target scope so no other agent's entry is
        // dropped, then merge in the change. Writing the whole map to the scope keeps the effective
        // value correct without depending on cross-scope object merging.
        const settings = await this.getSettings(scope, resourceUri);
        const toSet = { ...settings, [agent]: { ...settings[agent], ...agentSettings } };
        try {
            if (scope === undefined) {
                await this.aiConfigurationService.update(AISettingsServiceImpl.PREFERENCE_NAME, toSet, resourceUri);
            } else {
                await this.aiConfigurationService.set(AISettingsServiceImpl.PREFERENCE_NAME, toSet, scope, resourceUri);
            }
        } catch (e) {
            this.onDidChangeEmitter.fire();
            this.logger.warn('Updating the preferences was unsuccessful: ' + e);
        }
    }

    async getAgentSettings(agent: string, scope?: PreferenceScope, resourceUri?: string): Promise<RecursiveReadonly<AgentSettings> | undefined> {
        const settings = await this.getSettings(scope, resourceUri);
        return settings[agent];
    }

    async getSettings(scope?: PreferenceScope, resourceUri?: string): Promise<RecursiveReadonly<AISettings>> {
        await this.aiConfigurationService.ready;
        if (scope === undefined) {
            return this.aiConfigurationService.get<AISettings>(AISettingsServiceImpl.PREFERENCE_NAME, {}, resourceUri) ?? {};
        }
        const value = AiConfigurationInspection.effectiveValueInScope(this.aiConfigurationService.inspect(AISettingsServiceImpl.PREFERENCE_NAME, resourceUri), scope);
        return (value as AISettings) ?? {};
    }
}
