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

import { DisposableCollection, Emitter, Event } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ReviewChangeSet, ReviewFileChange } from './review-model';
import { ReviewChangeSetProvider } from './review-changeset-provider';

@injectable()
export class GitWorktreeChangeSetProvider implements ReviewChangeSetProvider {

    readonly id = 'git-worktree';

    @inject(ScmService)
    protected readonly scmService: ScmService;

    protected readonly onDidChangeChangeSetsEmitter = new Emitter<void>();
    readonly onDidChangeChangeSets: Event<void> = this.onDidChangeChangeSetsEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeChangeSetsEmitter);
    protected readonly repositoryListeners = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.scmService.onDidAddRepository(repo => {
            this.connectRepository(repo);
        }));
        this.toDispose.push(this.scmService.onDidRemoveRepository(() => {
            this.onDidChangeChangeSetsEmitter.fire();
        }));
        for (const repo of this.scmService.repositories) {
            this.connectRepository(repo);
        }
    }

    protected connectRepository(repo: import('@theia/scm/lib/browser/scm-repository').ScmRepository): void {
        this.repositoryListeners.push(repo.provider.onDidChange(() => {
            this.onDidChangeChangeSetsEmitter.fire();
        }));
    }

    async provideChangeSets(): Promise<ReviewChangeSet[]> {
        const changeSets: ReviewChangeSet[] = [];
        for (const repo of this.scmService.repositories) {
            const files: ReviewFileChange[] = [];
            for (const group of repo.provider.groups) {
                for (const resource of group.resources) {
                    const status = this.resolveStatus(resource.decorations?.letter);
                    files.push({
                        uri: resource.sourceUri,
                        originalUri: status !== 'added' ? repo.toUriAtRef(resource.sourceUri, 'HEAD') : undefined,
                        modifiedUri: status !== 'deleted' ? resource.sourceUri : undefined,
                        status,
                    });
                }
            }
            if (files.length > 0) {
                changeSets.push({
                    id: `git-worktree:${repo.provider.rootUri}`,
                    label: 'Working tree changes',
                    source: 'git-worktree',
                    files,
                    metadata: { rootUri: repo.provider.rootUri },
                });
            }
        }
        return changeSets;
    }

    protected resolveStatus(letter?: string): ReviewFileChange['status'] {
        switch (letter) {
            case 'A': return 'added';
            case 'D': return 'deleted';
            case 'R': return 'renamed';
            default: return 'modified';
        }
    }
}
