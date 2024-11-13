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

export type Message = AssistantResponse | Question | ProgressMessage;
interface BaseMessage {
    type: string;
    text: string;
}

export interface TokensInfo extends BaseMessage {
    type: 'tokensInfo';
    tokensSent: string;
    tokensReceived: string;
    cost: string;
}

export interface AssistantResponse extends BaseMessage {
    type: 'assistantResponse';
}

export interface Question extends BaseMessage {
    type: 'question';
    options: ('yes' | 'no' | 'all' | 'skip' | "don't")[];
}

export interface ToolMessage extends BaseMessage {
    type: 'tool';
    severity: 'info' | 'warning' | 'error';
}
export interface ProgressMessage extends BaseMessage {
    type: 'progress';
    done: boolean;
}
