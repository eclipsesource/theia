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

import { ContributionProvider, Emitter, Event } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { AiConfigurationCategory, AiConfigurationSearchItem } from './ai-configuration-category';

/**
 * Collects all contributed {@link AiConfigurationCategory} instances and exposes
 * them ordered for the AI Configuration view. Refires an aggregated
 * {@link onDidChange} whenever any category changes.
 */
@injectable()
export class AiConfigurationCategoryRegistry {

    @inject(ContributionProvider) @named(AiConfigurationCategory)
    protected readonly contributions: ContributionProvider<AiConfigurationCategory>;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        for (const category of this.contributions.getContributions()) {
            category.onDidChange?.(() => this.onDidChangeEmitter.fire());
        }
    }

    /**
     * Returns the categories ordered ascending by {@link AiConfigurationCategory.order}
     * (defaulting to `0`); `contributed` categories always sort after built-ins.
     */
    getCategories(): AiConfigurationCategory[] {
        return this.contributions.getContributions().slice().sort((a, b) => {
            const contributedA = a.contributed ? 1 : 0;
            const contributedB = b.contributed ? 1 : 0;
            if (contributedA !== contributedB) {
                return contributedA - contributedB;
            }
            return (a.order ?? 0) - (b.order ?? 0);
        });
    }

    getCategory(id: string): AiConfigurationCategory | undefined {
        return this.contributions.getContributions().find(category => category.id === id);
    }

    /** Aggregated deep-search index across all categories that provide one. */
    getSearchItems(): AiConfigurationSearchItem[] {
        return this.getCategories().flatMap(category => category.search?.getSearchItems() ?? []);
    }
}
