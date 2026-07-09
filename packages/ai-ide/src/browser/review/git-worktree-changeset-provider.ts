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

import { DisposableCollection, Emitter, Event, ILogger, ResourceProvider } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { DiffComputer, Change } from '@theia/scm/lib/browser/dirty-diff/diff-computer';
import { ContentLines } from '@theia/scm/lib/browser/dirty-diff/content-lines';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { DiffHunk, ReviewChangeSet, ReviewFileChange } from './review-model';
import { ReviewChangeSetProvider } from './review-changeset-provider';

@injectable()
export class GitWorktreeChangeSetProvider implements ReviewChangeSetProvider {

    readonly id = 'git-worktree';

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(ILogger)
    protected readonly logger: ILogger;

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
                await Promise.all(files.map(async file => {
                    file.hunks = await this.computeHunks(file);
                }));
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

    async computeHunks(file: ReviewFileChange): Promise<DiffHunk[]> {
        try {
            if (file.status === 'added') {
                return await this.computeAddedFileHunks(file);
            }
            if (file.status === 'deleted') {
                return await this.computeDeletedFileHunks(file);
            }
            return await this.computeModifiedFileHunks(file);
        } catch (e) {
            this.logger.warn(`Failed to compute hunks for ${file.uri.path.toString()}: ${e}`);
            return [];
        }
    }

    protected async computeAddedFileHunks(file: ReviewFileChange): Promise<DiffHunk[]> {
        if (!file.modifiedUri) {
            return [];
        }
        const content = await this.readFileContent(file.modifiedUri);
        const lines = content.split(/\r?\n/);
        if (lines.length === 0) {
            return [];
        }
        const diffContent = lines.map(l => `+ ${l}`).join('\n');
        return [{
            id: 'hunk-1',
            modifiedRange: Range.create(0, 0, lines.length - 1, 0),
            originalRange: Range.create(0, 0, 0, 0),
            content: diffContent,
            type: 'added',
        }];
    }

    protected async computeDeletedFileHunks(file: ReviewFileChange): Promise<DiffHunk[]> {
        if (!file.originalUri) {
            return [];
        }
        const content = await this.readOriginalContent(file.originalUri);
        const lines = content.split(/\r?\n/);
        if (lines.length === 0) {
            return [];
        }
        const diffContent = lines.map(l => `- ${l}`).join('\n');
        return [{
            id: 'hunk-1',
            modifiedRange: Range.create(0, 0, 0, 0),
            originalRange: Range.create(0, 0, lines.length - 1, 0),
            content: diffContent,
            type: 'deleted',
        }];
    }

    protected async computeModifiedFileHunks(file: ReviewFileChange): Promise<DiffHunk[]> {
        if (!file.originalUri || !file.modifiedUri) {
            return [];
        }
        let originalContent: string;
        try {
            originalContent = await this.readOriginalContent(file.originalUri);
        } catch {
            this.logger.info(`Cannot read original for ${file.uri.path.base}, treating as new file`);
            return this.computeAddedFileHunks(file);
        }
        const modifiedContent = await this.readFileContent(file.modifiedUri);

        const originalLines = ContentLines.arrayLike(ContentLines.fromString(originalContent));
        const modifiedLines = ContentLines.arrayLike(ContentLines.fromString(modifiedContent));
        const originalRawLines = originalContent.split(/\r?\n/);
        const modifiedRawLines = modifiedContent.split(/\r?\n/);

        const diffComputer = new DiffComputer();
        const dirtyDiff = diffComputer.computeDirtyDiff(originalLines, modifiedLines);

        return dirtyDiff.changes.map((change, index) =>
            this.changeToHunk(change, index, originalRawLines, modifiedRawLines)
        );
    }

    protected changeToHunk(change: Change, index: number, originalLines: string[], modifiedLines: string[]): DiffHunk {
        const id = `hunk-${index + 1}`;
        const isAddition = change.previousRange.start === change.previousRange.end;
        const isRemoval = change.currentRange.start === change.currentRange.end;

        let type: DiffHunk['type'];
        if (isAddition) {
            type = 'added';
        } else if (isRemoval) {
            type = 'deleted';
        } else {
            type = 'modified';
        }

        const contentParts: string[] = [];
        if (!isAddition) {
            for (let i = change.previousRange.start; i < change.previousRange.end; i++) {
                contentParts.push(`- ${originalLines[i] ?? ''}`);
            }
        }
        if (!isRemoval) {
            for (let i = change.currentRange.start; i < change.currentRange.end; i++) {
                contentParts.push(`+ ${modifiedLines[i] ?? ''}`);
            }
        }

        const modifiedRange = isRemoval
            ? Range.create(change.currentRange.start, 0, change.currentRange.start, 0)
            : Range.create(change.currentRange.start, 0, change.currentRange.end - 1, 0);

        const originalRange = isAddition
            ? Range.create(change.previousRange.start, 0, change.previousRange.start, 0)
            : Range.create(change.previousRange.start, 0, change.previousRange.end - 1, 0);

        return {
            id,
            modifiedRange,
            originalRange,
            content: contentParts.join('\n'),
            type,
        };
    }

    protected async readFileContent(uri: import('@theia/core/lib/common/uri').default): Promise<string> {
        const result = await this.fileService.read(uri);
        return result.value;
    }

    protected async readOriginalContent(uri: import('@theia/core/lib/common/uri').default): Promise<string> {
        const resource = await this.resourceProvider(uri);
        try {
            return await resource.readContents();
        } finally {
            resource.dispose();
        }
    }

    protected resolveStatus(letter?: string): ReviewFileChange['status'] {
        switch (letter) {
            case 'A':
            case 'U':
                return 'added';
            case 'D': return 'deleted';
            case 'R': return 'renamed';
            default: return 'modified';
        }
    }
}
