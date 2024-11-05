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

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';
import * as os from 'os';
import * as path from 'path';

export interface Message {
    type: string;
    text: string;
}

export interface TokensInfo extends Message {
    type: 'tokensInfo';
    tokensSent: string;
    tokensReceived: string;
    cost: string;
}

export interface AssistantResponse extends Message {
    type: 'assistantResponse';
}

export interface Question extends Message {
    type: 'question';
    typeOfQuestion: 'yes-no' | 'confirm';
}

export interface ToolMessage extends Message {
    type: 'tool';
    severity: 'info' | 'warning' | 'error';
}

const AIDER_CHAT_WRAPPER_FOLDER = 'aider-chat-wrapper';
const AIDER_CHAT_MAIN_FILE = 'aider-main.py';

export class Aider extends EventEmitter {
    protected process: ChildProcessWithoutNullStreams;

    constructor(args: string[] = []) {
        super();

        // TODO package aider-chat-wrapper in the backend somehow and replace absolute paths below
        const pythonExecutable = os.platform() === 'win32'
            ? path.join(__dirname, AIDER_CHAT_WRAPPER_FOLDER, 'venv', 'Scripts', 'python.exe')
            : path.join('/home/philip/Git/OpenSource/Theia/theia/packages/ai-aider/aider-chat-wrapper', 'venv', 'bin', 'python3');

        const aiderWrapperPath = path.join('/home/philip/Git/OpenSource/Theia/theia/packages/ai-aider/aider-chat-wrapper', AIDER_CHAT_MAIN_FILE);
        this.process = spawn(pythonExecutable, [aiderWrapperPath, ...args], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env // start with the same environment
        });

        const rl = readline.createInterface({ input: this.process.stdout });

        rl.on('line', line => this.handleLine(line));
        this.process.stderr.on('data', data => this.handleError(data));
        this.process.on('close', (code, signal) => this.handleClose(code, signal));
    }

    protected handleLine(line: string): void {
        // TODO
        console.log(line);
    }

    protected handleError(data: Buffer): void {
        const errorText = data.toString();
        const error = new Error(errorText);
        this.emit('error', error);
    }

    protected handleClose(code: number | null, signal: string | null): void {
        this.emit('close', code, signal);
    }

    public async add(fileUri: string): Promise<void> {
        this.write(`/add ${fileUri}`);
    }

    public async drop(fileUri: string): Promise<void> {
        this.write(`/drop ${fileUri}`);
    }

    public write(input: string): boolean {
        return this.process.stdin.write(`${input}\n`);
    }

    public close(): void {
        this.process.stdin.end();
    }
}
