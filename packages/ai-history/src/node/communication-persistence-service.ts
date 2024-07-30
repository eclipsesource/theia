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
import { CommunicationHistory } from '@theia/ai-core';
import { URI } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { inject, injectable } from '@theia/core/shared/inversify';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { AiHistoryPersistenceService } from '../common/history-persistence';

@injectable()
export class FileCommunicationPersistenceService implements AiHistoryPersistenceService {

    @inject(EnvVariablesServer)
    protected envServer: EnvVariablesServer;

    async saveHistory(agentId: string, history: CommunicationHistory): Promise<void> {
        const historyDir = await this.getHistoryDirectoryPath();
        const fileName = `${historyDir}/${agentId}.json`;
        writeFileSync(fileName, JSON.stringify(history, undefined, 2));
        console.log(`Saving communication history for agent ${agentId} to ${fileName}`);
    }

    private async getHistoryDirectoryPath(): Promise<string> {
        const configDir = new URI(await this.envServer.getConfigDirUri());
        const historyDir = `${configDir.path.fsPath()}/agent-communication`;
        return historyDir;
    }

    async loadHistory(agentId: string): Promise<CommunicationHistory> {
        const historyDir = await this.getHistoryDirectoryPath();
        const filePath = `${historyDir}/${agentId}.json`;
        try {
            const historyJson = readFileSync(filePath, 'utf-8');
            const communicationHistory = JSON.parse(historyJson);
            console.log(`Loaded communication history from ${agentId} from ${filePath}`);
            return communicationHistory;
        } catch (error) {
            console.log(`Could not load communication history for agent ${agentId}. Returning empty history.`);
        }
        return [];
    }

    async getRecordedAgents(): Promise<string[]> {
        const historyDir = await this.getHistoryDirectoryPath();
        const files = readdirSync(historyDir);
        return files.map((file: string) => file.replace('.json', ''));
    }
}
