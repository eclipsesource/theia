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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatVariables.ts

import { ContributionProvider, Disposable, ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ChatAgentLocation } from './chat-agents';
import { ChatModel, ChatRequest } from './chat-model';

export interface ChatVariable {
    /** provider id */
    id: string;
    /** variable name */
    name: string;
    /** variable description */
    description: string;
}

export interface ResolvedChatVariable {
    variable: ChatVariable;
    value: string;
}

export interface ExtensionChatRequestVariableValueData {
    level: string;
    value: string;
}

export interface ExtensionChatRequestVariableValue extends ResolvedChatVariable {
    data: ExtensionChatRequestVariableValueData[];
}

export interface ChatVariableResolutionRequest {
    variable: ChatVariable;
    arg?: string;
}

export interface ChatVariableResolutionContext {
    request: ChatRequest;
    model: ChatModel;
}

export type ChatVariableArg = string | { variable: string, arg?: string } | ChatVariableResolutionRequest;

export type ChatVariableResolver =
    (request: ChatVariableResolutionRequest, context: ChatVariableResolutionContext) => Promise<ResolvedChatVariable | undefined>;

export const ChatVariableService = Symbol('ChatVariableService');
export interface ChatVariableService {
    hasVariable(name: string, location: ChatAgentLocation): boolean;
    getVariable(name: string, location: ChatAgentLocation): Readonly<ChatVariable> | undefined;
    inspectVariable(name: string): Map<ChatAgentLocation, Readonly<ChatVariable>>;
    getVariables(location: ChatAgentLocation): Readonly<ChatVariable>[];

    registerVariable(variable: ChatVariable, resolver: ChatVariableResolver, locations?: ChatAgentLocation[]): Disposable;
    unregisterVariable(name: string, locations?: ChatAgentLocation[]): void;

    getResolver(name: string, location: ChatAgentLocation): ChatVariableResolver | undefined;
    resolveVariable(variable: ChatVariableArg, context: ChatVariableResolutionContext): ReturnType<ChatVariableResolver>
}

export const ChatVariableContribution = Symbol('ChatVariableContribution');
export interface ChatVariableContribution {
    registerVariables(service: ChatVariableService): void;
}

@injectable()
export class DefaultChatVariableService implements ChatVariableService {
    protected variables = new Map<string, ChatVariable>();
    protected resolvers = new Map<string, ChatVariableResolver>();

    @inject(ILogger) protected logger: ILogger;

    constructor(
        @inject(ContributionProvider) @named(ChatVariableContribution)
        protected readonly contributionProvider: ContributionProvider<ChatVariableContribution>
    ) {
        // TODO: Other registries do that 'onStart', doing it in the contructor may cause dependency problems (cycles, etc.) if the contributions require other services
        this.contributionProvider.getContributions().forEach(contribution => contribution.registerVariables(this));
    }

    protected getKey(name: string, location: ChatAgentLocation): string {
        return `${name.toLowerCase()}:${location}`;
    }

    protected hasLocation(key: string, location: ChatAgentLocation): boolean {
        return key.endsWith(`:${location}`);
    }

    getResolver(name: string, location: ChatAgentLocation): ChatVariableResolver | undefined {
        return this.resolvers.get(this.getKey(name, location));
    }

    hasVariable(name: string, location: ChatAgentLocation): boolean {
        return !!this.getVariable(name, location);
    }

    getVariable(name: string, location: ChatAgentLocation): Readonly<ChatVariable> | undefined {
        return this.variables.get(this.getKey(name, location));
    }

    inspectVariable(name: string): Map<ChatAgentLocation, Readonly<ChatVariable>> {
        const variableInspection = new Map<ChatAgentLocation, Readonly<ChatVariable>>();
        for (const location of ChatAgentLocation.ALL) {
            const variable = this.getVariable(name, location);
            if (variable) {
                variableInspection.set(location, variable);
            }
        }
        return variableInspection;
    }

    getVariables(location: ChatAgentLocation): Readonly<ChatVariable>[] {
        return [...this.variables.keys()].filter(key => this.hasLocation(key, location)).map(key => this.variables.get(key)!);
    }

    registerVariable(variable: ChatVariable, resolver: ChatVariableResolver, locations: ChatAgentLocation[] = ChatAgentLocation.ALL): Disposable {
        for (const location of locations) {
            if (this.hasVariable(variable.name, location)) {
                this.logger.warn(`There is already a variable called ${variable.name} registered at ${location}. This registration is ignored.`);
                continue;
            }
            this.variables.set(this.getKey(variable.name, location), variable);
            this.resolvers.set(this.getKey(variable.name, location), resolver);
        }
        return Disposable.create(() => this.unregisterVariable(variable.name, locations));
    }

    unregisterVariable(name: string, locations: ChatAgentLocation[] = ChatAgentLocation.ALL): void {
        for (const location of locations) {
            this.variables.delete(this.getKey(name, location));
            this.resolvers.delete(this.getKey(name, location));
        }
    }

    async resolveVariable(request: ChatVariableArg, context: ChatVariableResolutionContext): ReturnType<ChatVariableResolver> {
        const variableName = typeof request === 'string' ? request : typeof request.variable === 'string' ? request.variable : request.variable.name;
        const variable = this.getVariable(variableName, context.model.location);
        if (!variable) {
            return undefined;
        }
        const resolver = this.getResolver(variableName, context.model.location);
        if (!resolver) {
            return undefined;
        }
        const arg = typeof request === 'string' ? undefined : request.arg;
        return resolver({ variable, arg }, context);
    }
}
