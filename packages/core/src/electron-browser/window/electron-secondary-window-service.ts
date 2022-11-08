// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics, Ericsson, ARM, EclipseSource and others.
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

import { ipcRenderer, BrowserWindow } from '../../../electron-shared/electron';
import * as electronRemote from '../../../electron-shared/@electron/remote';
import { injectable, postConstruct } from 'inversify';
import { DefaultSecondaryWindowService } from '../../browser/window/default-secondary-window-service';
import { CloseSecondaryRequestArguments, CLOSE_SECONDARY_REQUESTED_SIGNAL } from '../../electron-common/messaging/electron-messages';

@injectable()
export class ElectronSecondaryWindowService extends DefaultSecondaryWindowService {

    private electronWindows: Map<string, BrowserWindow> = new Map();
    private electronWindowsById: Map<string, () => Promise<boolean>> = new Map();

    @postConstruct()
    override init(): void {
        super.init();
        ipcRenderer.addListener(CLOSE_SECONDARY_REQUESTED_SIGNAL, (_sender, args: CloseSecondaryRequestArguments) => this.handleCloseRequestedEvent(args));
    }

    protected async handleCloseRequestedEvent(event: CloseSecondaryRequestArguments): Promise<void> {
        const safeToClose = await this.safeToClose(event.windowId);
        if (safeToClose) {
            ipcRenderer.send(event.confirmChannel);
        } else {
            ipcRenderer.send(event.cancelChannel);
        }
    }

    protected override doCreateSecondaryWindow(id: string, wouldLoseStateOnClosing: () => boolean, tryCloseWidget: (trySaving: boolean) => Promise<boolean>,
        closed: (win: Window) => void): Window | undefined {
        let win: Window | undefined = undefined;
        electronRemote.getCurrentWindow().webContents.once('did-create-window', newElectronWindow => {
            // newElectronWindow.setMenuBarVisibility(false);
            this.electronWindows.set(id, newElectronWindow);
            const electronId = newElectronWindow.id.toString();
            this.electronWindowsById.set(electronId, () => tryCloseWidget(true));
            const closedHandler = () => {
                if (closed) {
                    closed(win!);
                }

                this.electronWindows.delete(id);
                this.electronWindowsById.delete(electronId);
            };
            newElectronWindow.once('closed', closedHandler);
        });
        win = window.open(DefaultSecondaryWindowService.SECONDARY_WINDOW_URL, id, 'popup') || undefined;
        return win;
    }

    override focus(win: Window): void {
        // window.name is the target name given to the window.open call as the second parameter.
        const electronWindow = this.electronWindows.get(win.name);
        if (electronWindow) {
            if (electronWindow.isMinimized()) {
                electronWindow.restore();
            }
            electronWindow.focus();
        } else {
            console.warn(`There is no known secondary window '${win.name}'. Thus, the window could not be focussed.`);
        }
    }

    safeToClose(windowId: string): Promise<boolean> {
        const closingHandler = this.electronWindowsById.get(windowId);
        if (closingHandler) {
            return closingHandler!();
        } else {
            return Promise.resolve(true);
        }
    }
}
