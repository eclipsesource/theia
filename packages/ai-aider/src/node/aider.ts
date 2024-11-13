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

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';
// import * as readline from 'readline';
// import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
// import { AssistantResponse, Question, ToolMessage } from '../common/message';
import { ProgressMessage } from '../common/message';
// import { Socket } from 'net';

const AIDER_CHAT_WRAPPER_FOLDER = 'aider-chat-wrapper';
const AIDER_CHAT_MAIN_FILE = 'aider-main.py';

export class Aider extends EventEmitter {
    protected process: ChildProcessWithoutNullStreams;
    private started = false;
    private progress?: ProgressMessage;

    constructor(workspace: string, args: string[] = []) {
        super();
        // const host = '127.0.0.1';

        // TODO package aider-chat-wrapper in the backend somehow and replace absolute paths below
        // const pythonExecutable = os.platform() === 'win32'
        //     ? path.join(__dirname, '../../../..', 'packages', 'ai-aider', AIDER_CHAT_WRAPPER_FOLDER, 'venv', 'Scripts', 'python.exe')
        //     : path.join(__dirname, '../../../..', 'packages', 'ai-aider', AIDER_CHAT_WRAPPER_FOLDER, 'venv', 'bin', 'python3');

        const aiderWrapperPath = path.join(__dirname, '../../../..', 'packages', 'ai-aider', AIDER_CHAT_WRAPPER_FOLDER, AIDER_CHAT_MAIN_FILE);
        this.process = spawn('python3', [aiderWrapperPath, ...args], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: fileURLToPath(workspace)
            // env: process.env // start with the same environment
        });

        this.process.stdout.on('data', dataBuffer => {
            const data = dataBuffer.toString();
            if (data.startsWith('Theia Wrapper started')) {
                this.started = true;
                this.emit('started');
                return;
            }
            if (this.started) {
                this.handleLine(data);
            }
        });
        this.process.stderr.on('data', data => {
            const msg = data.toString();
            if (msg.match(/\s*Initial repo scan can be slow in larger repos, but only happens once\./)) {
                this.progress = { type: 'progress', text: 'Initial repo scan can be slow in larger repos, but only happens once', done: false };
                this.emit('message', this.progress);
                return;
            }
            if (this.progress && msg.match(/\s*Scanning repo: 100%\|.+\| \d+\/\d+/)) {
                this.progress = { type: 'progress', text: 'Initial repo scan can be slow in larger repos, but only happens once', done: true };
                this.emit('message', this.progress);
                this.progress = undefined;
                return;
            }
            if (this.progress) {
                return;
            }

            console.error(msg);
        });
        this.process.on('close', (code, signal) => console.log(code, signal));
    }
    protected handleFullOutput(text: string): void {
        this.handleFullText(text);
        this.emit('data', '$END_REQUEST$');
    }
    private outputType?: string;
    private question?: string;
    protected handleFullText(line: string): void {
        const cleanLine = line;
        const matchOutput = cleanLine.match(/\[~output~\]([\s\S]*?)\[~\/output~\]/);
        if (matchOutput) {
            this.emit('data', matchOutput?.[1]);
        }
        const matchTool = cleanLine.match(/\[~tool_output~\]([\s\S]*?)\[~\/tool_output~\]/);
        if (matchTool) {
            this.emit('data', matchTool?.[1]);
        }
    }
    protected handleLine(line: string, outputType = this.outputType): void {
        if (line.length === 0) {
            return;
        }
        const cleanLine = line;

        if (cleanLine.match(/^\s*~END_REQUEST~\s*$/)) {
            this.emit('data', '$END_REQUEST$');
            return;
        }
        const matchEnd = cleanLine.match(/([\s\S]*?)\[~\/([\s\S]*?)~\]/);
        if (matchEnd && matchEnd[2] === outputType) {
            this.handleLine(matchEnd[1], outputType);
            const rest = cleanLine.slice((matchEnd.index ?? 0) + matchEnd[0].length);
            this.outputType = undefined;
            this.handleLine(rest, undefined);

            return;
        }
        const matchStart = cleanLine.match(/\[~(?!\/)([\s\S]*?)~\]([\s\S]*?)/);
        if (matchStart) {
            if (outputType) {
                const sliceIndex = matchStart.index ? matchStart.index - matchStart[0].length : 0;
                const restBefore = cleanLine.slice(0, sliceIndex);
                this.handleLine(restBefore, outputType);
            }
            this.outputType = matchStart[1];
            const rest = cleanLine.slice((matchStart.index ?? 0) + matchStart[0].length);
            this.handleLine(rest, this.outputType);
            return;
        }

        const questionEnd = cleanLine.match(/([\s\S]*?)<\/question>([\s\S]*?)/);
        // we had a question start in the previous message
        if (questionEnd && this.question) {
            this.question += questionEnd[1];
            this.emit('message', JSON.parse(this.question));
            this.question = undefined;
        }
        const questionStart = cleanLine.match(/([\s\S]*?)<question>([\s\S]*?)/);
        if (questionStart) {
            this.handleLine(questionStart[1]);
            if (questionEnd) {
                const endMatch = (questionEnd.index ?? 0) + questionEnd[1].length;
                const startMatch = (questionStart.index ?? 0) + questionStart[0].length;
                this.emit('message', JSON.parse(cleanLine.slice(startMatch, endMatch)));
            } else {
                this.question = questionStart[2];
                return;
            }
        }
        // we found an end, so handle everything afterwards too
        if (questionEnd) {
            this.handleLine(questionEnd[2]);
            return;
        }
        this.emit('data', cleanLine);
    }

    protected handleError(data: Buffer): void {
        const errorText = data.toString();
        const error = new Error(errorText);
        this.emit('error', error);
    }

    protected handleClose(code: number | null, signal: string | null): void {
        this.emit('close', code, signal);
    }

    // not used at the moment
    // public async add(fileUri: string): Promise<void> {
    //     this.write(`/add ${fileUri}`);
    // }

    // public async drop(fileUri: string): Promise<void> {
    //     this.write(`/drop ${fileUri}`);
    // }

    public write(input: string): boolean {
        // return this.client.write(`${input}\n`);
        return this.process.stdin.write(`${input}\n`);
    }
}
