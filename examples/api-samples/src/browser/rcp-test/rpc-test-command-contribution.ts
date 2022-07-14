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

import { CommandContribution, CommandRegistry, MessageService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { RpcTestService } from '../../common/rpc-test-service';
// eslint-disable-next-line import/no-extraneous-dependencies
import { shuffle } from 'lodash';
type TestServiceMethod = keyof RpcTestService;
@injectable()
export class RpcTestCommandContribution implements CommandContribution {
    @inject(RpcTestService)
    protected testService: RpcTestService;

    @inject(MessageService)
    protected messageService: MessageService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({ id: 'rpc-test', label: 'Trigger RPC-Performance Test' }, {
            execute: () => this.doTest(10)
        });
    }

    async doTest(testRuns: number): Promise<void> {
        const progress = await this.messageService.showProgress({ text: `Starting performance test [${testRuns} testRuns]`, options: { location: 'window' } });

        const testMethods: TestServiceMethod[] = [];
        for (let i = 0; i < testRuns; i++) {
            testMethods.push('binaryBuffer', 'largeObject', 'mediumObject', 'smallObject');
        }

        const results = new Map<TestServiceMethod, number[]>([['binaryBuffer', []], ['largeObject', []], ['mediumObject', []], ['smallObject', []]]);
        const shuffled = shuffle(testMethods);

        const total = shuffled.length;
        let done = 0;
        for (const method of shuffled) {
            done++;
            const start = performance.now();
            await this.testService[method]();
            const roundTripDuration = performance.now() - start;
            results.get(method)?.push(roundTripDuration);
            const current = results.get(method)!.length;
            progress.report({
                message: `Completed ${current} of ${testRuns} for method '${method}' [${done} of ${total}]`,
                work: { done, total }
            });
        };

        const result = {
            smallObject: median(results.get('smallObject')!).toFixed(2),
            mediumObject: median(results.get('mediumObject')!).toFixed(2),
            largeObject: median(results.get('largeObject')!).toFixed(2),
            binaryBuffer: median(results.get('binaryBuffer')!).toFixed(2)
        };

        progress.cancel();
        this.messageService.info(JSON.stringify(result, undefined, 2));
        console.log('Performance Testresult:', result);


    }
}

function median(numbers: number[]): number {
    const sorted = numbers.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}
