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
import * as React from '@theia/core/shared/react';
import { LanguageModel } from '../../common/language-model';

export interface LanguageModelSettingsProps {
    agentId: string;
    selectedPurposes: Map<string, string>;
    selectedModels: Map<string, Map<string, string>>;
    languageModels?: LanguageModel[];
    // modelService: LanguageModelSettingsService;
}

export const LanguageModelRenderer: React.FC<LanguageModelSettingsProps> = (
    { agentId, selectedPurposes, languageModels, selectedModels }) => <div className='language-model-container'>
        <label className="theia-header no-select" htmlFor={`purpose-select-${agentId}`}>Purpose:</label>
        <select
            className="theia-select"
            id={`purpose-select-${agentId}`}
            value={selectedPurposes.get(agentId)}
        // onChange={event => this.onSelectedPurposesChange(agentId, event)}
        >
            <option value=""></option>
            {/* {agent.languageModelRequirements.map((requirements, index) => (
                <option key={index} value={requirements.purpose}>{requirements.purpose}</option>
            ))} */}
        </select>
        {/* {agent.languageModelRequirements
            .filter(requirements => requirements.purpose === selectedPurposes.get(agentId))
            .map((requirements, index) => <div key={index}>
                {requirements.identifier && <p><strong>Identifier: </strong> {requirements.identifier}</p>}
                {requirements.name && <p><strong>Name: </strong> {requirements.name}</p>}
                {requirements.vendor && <p><strong>Vendor: </strong> {requirements.vendor}</p>}
                {requirements.version && <p><strong>Version: </strong> {requirements.version}</p>}
                {requirements.family && <p><strong>Family: </strong> {requirements.family}</p>}
                {requirements.tokens && <p><strong>Tokens: </strong> {requirements.tokens}</p>}
            </div>)
        } */}
        {selectedPurposes.get(agentId) &&
            <>
                <label className="theia-header no-select" htmlFor={`model-select-${agentId}`}>Language Model:</label>
                <select
                    className="theia-select"
                    id={`model-select-${agentId}`}
                    value={selectedModels?.get(agentId)?.get(selectedPurposes.get(agentId)!)}
                // onChange={event => this.onSelectedModelChange(agentId, event)}
                >
                    <option value=""></option>
                    {languageModels?.map((model, index) => (
                        <option key={index} value={model.id}>{model.name ?? model.id}</option>
                    ))}
                </select>
            </>
        }
    </div>;
