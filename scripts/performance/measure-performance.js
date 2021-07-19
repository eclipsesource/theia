/********************************************************************************
 * Copyright (C) 2021 STMicroelectronics and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
const puppeteer = require('puppeteer');
const fs = require('fs');
const resolve = require('path').resolve;

const path = resolve('./workspace');

const lcp = 'Largest Contentful Paint (LCP)';
const performanceTag = braceText('Performance');

let name = 'Measurement';
let url = 'http://localhost:3000/#' + path;
let file = 'profiles/profile.json';
let headless = true;
let runs = 10;

(async () => {
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index++) {
        if (args[index].startsWith('--')) {
            let next = args[index + 1];
            if (!next.startsWith('--')) {
                if (args[index] === '--name') {
                    name = args[index + 1];
                    index++;
                }
                if (args[index] === '--url') {
                    url = args[index + 1];
                    index++;
                }
                if (args[index] === '--file') {
                    file = args[index + 1];
                    index++;
                }
                if (args[index] === '--headless') {
                    if (args[index + 1] === 'true' || args[index + 1] === 'false') {
                        headless = args[index + 1];
                        index++;
                    }
                }
                if (args[index] === '--runs') {
                    runs = args[index + 1];
                    index++;
                }
            }
        }
    }
    await measurePerformance(name, url, file, headless, runs);
})();

async function measurePerformance(name, url, file, headless, runs) {
    const multipleRuns = runs > 1 ? true : false;
    let runNr = 1;
    let durations = [];
    while (runs > 0) {
        const browser = await puppeteer.launch({ headless: headless });
        const page = await browser.newPage();

        await page.tracing.start({ path: file, screenshots: true });

        await page.goto(url);
        await page.waitForSelector('.theia-preload', { state: 'detached' });
        await page.waitForSelector('.fa-exclamation-triangle', { state: 'visible' });

        await page.tracing.stop();

        await browser.close();

        durations.push(parseFloat(await measureStartup(file, name, runNr, multipleRuns)));

        runs--;
        runNr++;
    }

    if (multipleRuns) {
        const mean = calculateMean(durations);
        logDuration(name, 'MEAN', lcp, mean);
        console.log(performanceTag + braceText(name) + braceText('STDEV') + ' ' + lcp + ': ' + calculateStandardDeviation(mean, durations));
    }
}

async function measureStartup(profilePath, name, runNr, multipleRuns) {
    let startEvent;
    const tracing = JSON.parse(fs.readFileSync('./' + profilePath, 'utf8'));
    const lcpEvents = tracing.traceEvents.filter(x => {
        if (isStart(x)) {
            startEvent = x;
            return false;
        }
        return isLCP(x);
    });

    if (startEvent === null) {
        throw new Error('Couldnt find a Start entry');
    } else {
        const dur = duration(lcpEvents[lcpEvents.length - 1], startEvent);
        logDuration(name, runNr, lcp, dur, multipleRuns);
        return dur;
    }
}

function isLCP(x) {
    return x.name === 'largestContentfulPaint::Candidate';
}

function isStart(x) {
    return x.name === 'TracingStartedInBrowser';
}

function duration(event, startEvent) {
    return ((event.ts - startEvent.ts) / 1000000).toFixed(3);
}

function logDuration(name, run, metric, duration, multipleRuns = true) {
    let runText = '';
    if (multipleRuns) {
        runText = braceText(run);
    }
    console.log(performanceTag + braceText(name) + runText + ' ' + metric + ': ' + duration + ' seconds');
}

function calculateMean(array) {
    let sum = 0;
    array.forEach(x => {
        sum += x;
    });
    return (sum / array.length).toFixed(3);
};

function calculateStandardDeviation(mean, array) {
    let count = 0;
    array.forEach(time => {
        count += Math.pow((time - mean), 2)
    });
    const variance = count / array.length;
    return Math.sqrt(variance).toFixed(3);
}

function braceText(text) {
    return '[' + text + ']';
}
