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

import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceServer } from '@theia/workspace/lib/common';
// import { EventEmitter } from 'events';
import { AiderConnector, AiderConnectorClient } from '../common/api';
import { Aider } from './aider';
import { Message } from '../common/message';

@injectable()
export class AiderConnectorImpl implements AiderConnector {
    @inject(WorkspaceServer) workspaceServer: WorkspaceServer;

    private client: AiderConnectorClient;
    private aider: Aider;
    async startAider(): Promise<void> {
        let resolve: (value: void) => void;
        const result = new Promise<void>(res => {
            resolve = res;
        });
        const workspace = (await this.workspaceServer.getRecentWorkspaces())[0];
        this.aider = new Aider(workspace);
        this.aider.on('message', (message: Message) => {
            console.log('Received message:', JSON.stringify(message));
            this.client.aiderMessage(message);
        });
        this.aider.on('data', (message: string) => {
            this.client.aiderMessage(message);
        });
        this.aider.on('tool', (message: string) => {
            console.log('Tool message:', message);
        });
        this.aider.on('ask', (message: string) => {
            console.log('Ask message:', message);
        });
        this.aider.on('error', (error: Error) => {
            console.error('Error:', error.message);
        });
        this.aider.on('close', (code: number | null, signal: string | null) => {
            console.log(`Process exited with code ${code} and signal ${signal}`);
        });
        this.aider.on('started', () => {
            resolve();
        });

        return result;
        // setTimeout(() => {
        //     this.aider.write('Hello, Aider!');
        // }, 2000);
        // setTimeout(() => {
        //     this.aider.close();
        // }, 5000);
    }
    async sendMessage(message: string): Promise<void> {
        if (this.aider === undefined) {
            await this.startAider();
        }
        this.aider.write(message);
    }
    setClient(client: AiderConnectorClient): void {
        this.client = client;
    }

    async add(paths: (string | undefined)[]): Promise<void> {
        if (this.aider === undefined) {
            await this.startAider();
        }
        this.aider.add(paths);
    }

    // private eventEmitterToAsyncIterator(emitter: EventEmitter): AsyncIterableIterator<string> {
    //     return {
    //         [Symbol.asyncIterator](): AsyncIterableIterator<string> {
    //             return this;
    //         },
    //         next(): Promise<IteratorResult<string>> {
    //             return new Promise(resolve => {
    //                 const handler = (data: string) => {
    //                     emitter.off('data', handler);
    //                     resolve({ value: data, done: false });
    //                 };
    //                 emitter.once('data', handler);
    //             });
    //         },
    //         return(): Promise<IteratorResult<string>> {
    //             // emitter.removeAllListeners(eventName);
    //             return Promise.resolve({ value: undefined, done: true });
    //         },
    //         throw(error: Error): Promise<IteratorResult<string>> {
    //             // emitter.removeAllListeners(eventName);
    //             return Promise.reject(error);
    //         },
    //     };
    // }

}
