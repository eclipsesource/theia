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

import { CommandContribution, CommandRegistry } from '@theia/core';
import { ContainerModule, injectable } from '@theia/core/shared/inversify';
import { Aider, Message } from './aider';

export const OpenAiModelFactory = Symbol('OpenAiModelFactory');

export default new ContainerModule(bind => {
    bind(CommandContribution).to(AiderCommandContribution);
});

@injectable()
export class AiderCommandContribution implements CommandContribution {
    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({
            id: 'aider:open',
            label: 'Start Aider'
        }, {
            execute: () => {
                const aider = new Aider(['--dry-run', '--no-git']);
                aider.on('message', (message: Message) => {
                    console.log('Received message:', message.text);
                });
                aider.on('error', (error: Error) => {
                    console.error('Error:', error.message);
                });
                aider.on('close', (code: number | null, signal: string | null) => {
                    console.log(`Process exited with code ${code} and signal ${signal}`);
                });
                setTimeout(() => {
                    aider.write('Hello, Aider!');
                }, 2000);
                setTimeout(() => {
                    aider.close();
                }, 5000);
            }
        });
    }
}
