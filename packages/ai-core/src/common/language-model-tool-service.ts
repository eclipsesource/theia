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
// import { ToolRequest } from './language-model';

export interface LanguageModelToolServiceFrontend {
    registerToolCallback(agentId: string, callback: (toolId: string, arg_string: string) => unknown): void;
    callTool(agentId: string, toolId: string, arg_string: string): Promise<unknown>;
}
export const LanguageModelToolService = Symbol('LanguageModelToolService');
export interface LanguageModelToolServer {
    callTool(agentId: string, toolId: string, arg_string: string): Promise<unknown>;
    setClient(client: LanguageModelToolServiceFrontend): void;
}
// export class LanguageModelToolServiceImpl implements LanguageModelToolService {
//     protected readonly tools: Map<string, (arg_string: string) => unknown> = new Map();
//     protected client: LanguageModelToolServiceClient;

//     setClient(client: LanguageModelToolServiceClient): void {
//         this.client = client;
//     }

//     registerTool(tool: ToolRequest<object>, callback: (arg_string: string) => unknown): void {
//         this.tools.set(tool.name, callback);
//     }
// }
/**
 * F/B: agent -> resgiters at the toolservice
 * RPCClient: llm -> notifies the toolservice that a tool was called
 * F/B: toolservice -> notifies the agent that a tool was called
 * F/B: agent returns the tool call result -> toolservice
 * RPCCLient: toolservice -> notifies llm about toolcall result
 * 
 */
