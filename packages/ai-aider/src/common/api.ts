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
import { Event } from '@theia/core';
import { Message } from './message';

export const AIDER_CONNECTOR_PATH = '/services/aider-connector';
export const AiderConnector = Symbol('AiderConnector');
export interface AiderConnector {
    startAider(): Promise<void>;
    sendMessage(message: string): Promise<void>;
    setClient(client: AiderConnectorClient): void;
}
export interface AiderMessageResponse {
    stream: AsyncIterable<string>;
}
export const AiderConnectorClient = Symbol('AiderConnectorClient');
export interface AiderConnectorClient {
    aiderMessage(message: string | Message): void;
    onAiderMessage: Event<string | Message>;
}
