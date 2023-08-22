// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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

import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MessageService, ProgressService, URI, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    CommonCommands,
    CommonMenus,
    SingleTextInputDialog
} from '@theia/core/lib/browser';
import { BFSRequire } from 'browserfs';

import { clone } from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

import { FileService } from '@theia/filesystem/lib/browser/file-service';

const fs = BFSRequire('fs');

async function doClone(targetFolder: string, repositoryURL: string, messageService: MessageService): Promise<void> {
    await clone({ fs, http, dir: targetFolder, url: repositoryURL, depth: 1, corsProxy: 'http://localhost:3001' }).catch((e: Error) => {
        messageService.error('An error occurred while importing the repository: ' + e.message);
        console.error(e);
    });
}

function getRepositoryName(repositoryURL: string): string {
    if (!repositoryURL.endsWith('.git')) {
        repositoryURL = repositoryURL.concat('.git');
    }
    const segments = repositoryURL.split(/\/|\./g);
    return segments[segments.length - 2];
}

export const IMPORT_REPOSITORY = Command.toDefaultLocalizedCommand({
    id: 'filesystem:import-repository',
    category: CommonCommands.FILE_CATEGORY,
    label: 'Import repository'
});

/** Create the workspace section after open {@link CommonMenus.FILE_OPEN}. */
export const IMPORT = [...CommonMenus.FILE_OPEN, '2_import'];

@injectable()
export class ImportRepositoryFrontendContribution implements CommandContribution, MenuContribution {
    @inject(ProgressService)
    readonly progressService: ProgressService;

    @inject(MessageService)
    readonly messageService: MessageService;

    @inject(FileService)
    readonly fileService: FileService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(IMPORT_REPOSITORY, {
            isEnabled: () => true,
            isVisible: () => true,
            execute: () => {
                this.cloneRepository();
            }
        });
    }
    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(IMPORT, {
            commandId: IMPORT_REPOSITORY.id,
        });
    }

    async cloneRepository(): Promise<void> {
        const dialog = new SingleTextInputDialog(
            {
                title: nls.localize('theia/samples/importRepository', 'Import repository'),
                placeholder: nls.localize('theia/samples/importRepository/repository', 'Repository URL'),

            });
        let repositoryURL = await dialog.open();
        if (!repositoryURL) {
            return;
        }
        if (!repositoryURL.endsWith('.git')) {
            repositoryURL = repositoryURL.concat('.git');
        }
        const repositoryName = getRepositoryName(repositoryURL);
        const targetFolder = `/home/git/${repositoryName}`;

        if (await this.fileService.exists(new URI(targetFolder))) {
            this.messageService.error(`Cannot import repository: the folder ${targetFolder} already exists.`);
            return;
        }

        this.progressService.withProgress('', 'explorer', () => doClone(targetFolder, repositoryURL ?? '', this.messageService));
    }
}
