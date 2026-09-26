// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named } from 'inversify';
import { FrontendApplicationContribution, OpenerService } from '../browser';
import { ILogger, URI } from '../common';

interface TauriUrlWindow extends Window {
    __theiaTauriOpenUrls?: string[];
}

@injectable()
export class TauriUriHandlerContribution implements FrontendApplicationContribution {
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(ILogger) @named('core:TauriUriHandlerContribution') protected readonly logger: ILogger;
    protected draining = false;

    onStart(): void {
        window.addEventListener('theia-tauri-open-url', this.onOpenUrl);
        this.onOpenUrl();
    }

    onStop(): void {
        window.removeEventListener('theia-tauri-open-url', this.onOpenUrl);
    }

    protected readonly onOpenUrl = (): void => {
        if (this.draining) {
            return;
        }
        this.draining = true;
        this.drain().catch(error => this.logger.error('Could not dispatch Tauri URL:', error)).finally(() => {
            this.draining = false;
            if ((window as TauriUrlWindow).__theiaTauriOpenUrls?.length) {
                this.onOpenUrl();
            }
        });
    };

    protected async drain(): Promise<void> {
        const targetWindow = window as TauriUrlWindow;
        while (targetWindow.__theiaTauriOpenUrls?.length) {
            const value = targetWindow.__theiaTauriOpenUrls.shift()!;
            try {
                const uri = new URI(value);
                const handler = await this.openerService.getOpener(uri);
                if (handler) {
                    await handler.open(uri);
                } else {
                    this.logger.warn('No opener for incoming URL');
                }
            } catch (error) {
                this.logger.warn('Could not open incoming URL:', error);
            }
        }
    }
}
