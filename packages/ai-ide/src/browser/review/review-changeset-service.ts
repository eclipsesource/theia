// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { ContributionProvider, DisposableCollection, Emitter } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { ReviewChangeSet } from './review-model';
import { ReviewChangeSetProvider } from './review-changeset-provider';

@injectable()
export class ReviewChangeSetService {

    @inject(ContributionProvider) @named(ReviewChangeSetProvider)
    protected readonly providers: ContributionProvider<ReviewChangeSetProvider>;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    @postConstruct()
    protected init(): void {
        for (const provider of this.providers.getContributions()) {
            if (provider.onDidChangeChangeSets) {
                this.toDispose.push(provider.onDidChangeChangeSets(() => this.onDidChangeEmitter.fire()));
            }
        }
    }

    async getChangeSets(): Promise<ReviewChangeSet[]> {
        const results: ReviewChangeSet[] = [];
        for (const provider of this.providers.getContributions()) {
            const sets = await provider.provideChangeSets();
            results.push(...sets);
        }
        return results;
    }
}
