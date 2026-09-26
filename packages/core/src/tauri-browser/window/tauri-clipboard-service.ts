// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { Emitter, Event } from '../../common/event';
import { ClipboardService } from '../../browser/clipboard-service';
import { TauriNativeService } from '../../tauri-common/tauri-native-service';

@injectable()
export class TauriClipboardService implements ClipboardService {
    @inject(TauriNativeService) protected readonly nativeService: TauriNativeService;

    protected readonly onDidWriteTextEmitter = new Emitter<string>();
    readonly onDidWriteText: Event<string> = this.onDidWriteTextEmitter.event;

    readText(): Promise<string> {
        return this.nativeService.readClipboardText();
    }

    async writeText(value: string): Promise<void> {
        await this.nativeService.writeClipboardText(value);
        this.onDidWriteTextEmitter.fire(value);
    }
}
