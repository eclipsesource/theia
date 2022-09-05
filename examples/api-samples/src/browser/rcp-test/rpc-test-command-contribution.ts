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
            execute: () => this.doTest(500, 5)
        });
    }

    async doTest(testRuns: number, trim: number): Promise<void> {
        const progress = await this.messageService.showProgress({ text: `Starting performance test [${testRuns} testRuns]`, options: { location: 'window' } });

        const testMethods: TestServiceMethod[] = [];
        for (let i = 0; i < testRuns; i++) {
            testMethods.push('binaryBuffer', 'largeObject', 'mediumObject', 'smallObject', 'largeString', 'multipleMediumStrings');
        }

        for (let i = 0; i < testRuns; i++) {
            const results = new Map<TestServiceMethod, number[]>([['binaryBuffer', []], ['largeObject', []],
            ['mediumObject', []], ['smallObject', []], ['largeString', []], ['multipleMediumStrings', []]]);
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
            let smallObjectDurations = results.get('smallObject')!;
            smallObjectDurations = smallObjectDurations.slice(trim, smallObjectDurations.length - trim);
            let mediumObjectDurations = results.get('mediumObject')!;
            mediumObjectDurations = mediumObjectDurations.slice(trim, smallObjectDurations.length - trim);
            let largeObjectDurations = results.get('largeObject')!;
            largeObjectDurations = largeObjectDurations.slice(trim, smallObjectDurations.length - trim);
            let binaryBuffersDurations = results.get('binaryBuffer')!;
            binaryBuffersDurations = binaryBuffersDurations.slice(trim, smallObjectDurations.length - trim);
            let largeStringDurations = results.get('largeString')!;
            largeStringDurations = largeStringDurations.slice(trim, smallObjectDurations.length - trim);
            let multipleMediumStringsDuration = results.get('multipleMediumStrings')!;
            multipleMediumStringsDuration = multipleMediumStringsDuration.slice(trim, smallObjectDurations.length - trim);

            const result = {
                smallObject: stats(smallObjectDurations),
                mediumObject: stats(mediumObjectDurations),
                largeObject: stats(largeObjectDurations),
                binaryBuffer: stats(binaryBuffersDurations),
                largeString: stats(largeStringDurations),
                multipleMediumString: stats(multipleMediumStringsDuration)
            };

            progress.cancel();
            const statsMessage = JSON.stringify(result, undefined, 2);
            this.messageService.info(statsMessage);
            console.log('Performance Testresult:', statsMessage);

        }
    }
}

function stats(numbers: number[]): { median: string, mean: string; stdDev: string } {
    return {
        median: median(numbers).toFixed(2),
        mean: mean(numbers).toFixed(2),
        stdDev: standardDeviation(numbers).toFixed(2),
    };
}
function median(numbers: number[]): number {
    const sorted = numbers.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}

function mean(numbers: number[]): number {
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function standardDeviation(numbers: number[]): number {
    const m = mean(numbers);
    return Math.sqrt(numbers.map(x => Math.pow(x - m, 2)).reduce((a, b) => a + b) / numbers.length);
}
