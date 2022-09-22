// *****************************************************************************
// Copyright (C) 2019 Arm and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, interfaces } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, CommandHandler, CancellationTokenSource } from '@theia/core';
import { FrontendApplicationContribution, LabelProviderContribution } from '@theia/core/lib/browser';
import { SampleDynamicLabelProviderContribution } from './sample-dynamic-label-provider-contribution';
import { TestService } from '../../common/updater/test-service';

export namespace ExampleLabelProviderCommands {
    const EXAMPLE_CATEGORY = 'Examples';
    export const TOGGLE_SAMPLE: Command = {
        id: 'example_label_provider.toggle',
        category: EXAMPLE_CATEGORY,
        label: 'Toggle Dynamically-Changing Labels'
    };
}

@injectable()
export class SampleDynamicLabelProviderCommandContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(SampleDynamicLabelProviderContribution)
    protected readonly labelProviderContribution: SampleDynamicLabelProviderContribution;

    @inject(TestService)
    protected readonly testService: TestService;

    initialize(): void { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ExampleLabelProviderCommands.TOGGLE_SAMPLE, new ExampleLabelProviderCommandHandler(this.labelProviderContribution));
        commands.registerCommand({ id: 'test.service.command', label: 'Invoke RPC test service (with delayed cancellation)' }, {
            execute: () => {
                const source = new CancellationTokenSource();
                this.testService.foo(source.token).then(result => {
                    console.log('FOO result:', result);
                });

                delay(250).then(() => source.cancel());
            }
        });
        commands.registerCommand({ id: 'test.service.command1', label: 'Invoke RPC test service (no cancellation)' }, {
            execute: () => {
                const source = new CancellationTokenSource();
                this.testService.foo(source.token).then(result => {
                    console.log('FOO result:', result);
                });
            }
        });
        commands.registerCommand({ id: 'test.service.command2', label: 'Invoke RPC test service (with immediate cancellation)' }, {
            execute: () => {
                const source = new CancellationTokenSource();
                this.testService.foo(source.token).then(result => {
                    console.log('FOO result:', result);
                });
                source.cancel();
            }
        });

        commands.registerCommand({ id: 'test.service.command3', label: 'Invoke RPC test service (with cancellation after response)' }, {
            execute: () => {
                const source = new CancellationTokenSource();
                this.testService.foo(source.token).then(result => {
                    console.log('FOO result:', result);
                    source.cancel();
                })
            }
        });
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class ExampleLabelProviderCommandHandler implements CommandHandler {

    constructor(private readonly labelProviderContribution: SampleDynamicLabelProviderContribution) {
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute(...args: any[]): any {
        this.labelProviderContribution.toggle();
    }

}

export const bindDynamicLabelProvider = (bind: interfaces.Bind) => {
    bind(SampleDynamicLabelProviderContribution).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(SampleDynamicLabelProviderContribution);
    bind(CommandContribution).to(SampleDynamicLabelProviderCommandContribution).inSingletonScope();
};
