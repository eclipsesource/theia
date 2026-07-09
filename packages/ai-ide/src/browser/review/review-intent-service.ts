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

import { Emitter, Event } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { ReviewIntent } from './review-model';

@injectable()
export class ReviewIntentService {

    protected readonly intents = new Map<string, ReviewIntent[]>();

    protected _activeChangeSetId: string | undefined;

    protected readonly onDidChangeEmitter = new Emitter<string>();
    readonly onDidChange: Event<string> = this.onDidChangeEmitter.event;

    get activeChangeSetId(): string | undefined {
        return this._activeChangeSetId;
    }

    set activeChangeSetId(id: string | undefined) {
        this._activeChangeSetId = id;
    }

    addIntent(changeSetId: string, intent: ReviewIntent): void {
        const existing = this.intents.get(changeSetId) ?? [];
        existing.push(intent);
        this.intents.set(changeSetId, existing);
        this.onDidChangeEmitter.fire(changeSetId);
    }

    removeIntent(changeSetId: string, intentId: string): void {
        const existing = this.intents.get(changeSetId);
        if (!existing) {
            return;
        }
        const filtered = existing.filter(i => i.id !== intentId);
        if (filtered.length === 0) {
            this.intents.delete(changeSetId);
        } else {
            this.intents.set(changeSetId, filtered);
        }
        this.onDidChangeEmitter.fire(changeSetId);
    }

    getIntents(changeSetId: string): ReviewIntent[] {
        return this.intents.get(changeSetId) ?? [];
    }

    clearIntents(changeSetId: string): void {
        if (this.intents.delete(changeSetId)) {
            this.onDidChangeEmitter.fire(changeSetId);
        }
    }
}
