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

import * as React from '@theia/core/shared/react';
import { Emitter, Event, nls } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { codicon, Message, ReactWidget } from '@theia/core/lib/browser';
import { AiConfigurationCategoryRegistry } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category-registry';
import { AiConfigurationSelectionModel } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-selection-model';
import { AiConfigurationSearchItem } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationSearch } from './ai-configuration-search';

/**
 * The search box above the category tree. It does double duty:
 * - emits {@link onDidChangeFilter} so the tree can live-filter its nodes, and
 * - shows a cross-category deep-results dropdown that navigates the shared
 *   {@link AiConfigurationSelectionModel} when a result is picked.
 */
@injectable()
export class AiConfigurationSearchWidget extends ReactWidget {

    static readonly ID = 'ai-configuration-search';

    @inject(AiConfigurationCategoryRegistry)
    protected readonly registry: AiConfigurationCategoryRegistry;

    @inject(AiConfigurationSelectionModel)
    protected readonly selectionModel: AiConfigurationSelectionModel;

    protected query = '';
    protected results: AiConfigurationSearchItem[] = [];
    protected focusedIndex = 0;
    protected open = false;
    /** Lazily built deep-search index; invalidated on registry changes. */
    protected index: AiConfigurationSearchItem[] | undefined;

    protected readonly onDidChangeFilterEmitter = new Emitter<string>();
    readonly onDidChangeFilter: Event<string> = this.onDidChangeFilterEmitter.event;

    @postConstruct()
    protected init(): void {
        this.id = AiConfigurationSearchWidget.ID;
        this.addClass('ai-configuration-search');
        this.toDispose.push(this.onDidChangeFilterEmitter);
        this.toDispose.push(this.registry.onDidChange(() => this.onIndexInvalidated()));
        this.update();
    }

    protected getIndex(): AiConfigurationSearchItem[] {
        if (!this.index) {
            this.index = this.registry.getSearchItems();
        }
        return this.index;
    }

    protected onIndexInvalidated(): void {
        this.index = undefined;
        if (this.query.trim().length > 0) {
            this.recompute();
        }
        this.update();
    }

    protected recompute(): void {
        this.results = AiConfigurationSearch.match(this.getIndex(), this.query);
        this.focusedIndex = 0;
    }

    protected onInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        this.query = event.target.value;
        this.recompute();
        this.open = this.query.trim().length > 0;
        this.onDidChangeFilterEmitter.fire(this.query);
        this.update();
    };

    protected onInputFocus = (): void => {
        if (this.query.trim().length > 0) {
            this.recompute();
            this.open = true;
            this.update();
        }
    };

    protected onInputBlur = (): void => {
        // A result mousedown calls preventDefault, so it never triggers this blur.
        this.open = false;
        this.update();
    };

    protected onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (this.results.length === 0) {
                return;
            }
            event.preventDefault();
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            this.focusedIndex = Math.min(Math.max(this.focusedIndex + delta, 0), this.results.length - 1);
            this.update();
        } else if (event.key === 'Enter') {
            const item = this.results[this.focusedIndex] ?? this.results[0];
            if (item) {
                this.pick(item);
            }
        } else if (event.key === 'Escape') {
            if (this.open) {
                event.preventDefault();
                this.open = false;
                this.update();
            }
        }
    };

    protected onResultMouseDown = (event: React.MouseEvent<HTMLElement>): void => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-result-index]');
        if (row) {
            // Prevent the input blur so focus stays put while we navigate.
            event.preventDefault();
            const item = this.results[Number(row.dataset.resultIndex)];
            if (item) {
                this.pick(item);
            }
        }
    };

    protected pick(item: AiConfigurationSearchItem): void {
        this.selectionModel.select(item.target);
        this.clear();
    }

    /** Clears the query, closes the dropdown, and clears the tree filter. */
    clear(): void {
        this.query = '';
        this.results = [];
        this.focusedIndex = 0;
        this.open = false;
        this.onDidChangeFilterEmitter.fire('');
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='ai-configuration-search-wrap'>
            <span className={`ai-configuration-search-icon ${codicon('search')}`}></span>
            <input
                className='theia-input ai-configuration-search-input'
                type='text'
                spellCheck={false}
                placeholder={nls.localize('theia/ai/core/aiConfiguration/searchPlaceholder', 'Search AI settings')}
                value={this.query}
                onChange={this.onInputChange}
                onFocus={this.onInputFocus}
                onBlur={this.onInputBlur}
                onKeyDown={this.onInputKeyDown}
            />
            {this.open && this.renderResults()}
        </div>;
    }

    protected renderResults(): React.ReactNode {
        if (this.results.length === 0) {
            return <div className='ai-configuration-search-results'>
                <div className='ai-configuration-search-empty'>
                    {nls.localize('theia/ai/core/aiConfiguration/searchNoResults', 'No AI settings match "{0}".', this.query.trim())}
                </div>
            </div>;
        }
        const firstTerm = AiConfigurationSearch.terms(this.query)[0];
        return <div className='ai-configuration-search-results' onMouseDown={this.onResultMouseDown}>
            {this.results.map((item, index) => this.renderResult(item, index, firstTerm))}
        </div>;
    }

    protected renderResult(item: AiConfigurationSearchItem, index: number, firstTerm: string): React.ReactNode {
        const category = this.registry.getCategory(item.categoryId);
        const className = 'ai-configuration-search-result' + (index === this.focusedIndex ? ' focused' : '');
        return <div
            key={`${item.categoryId}:${item.target.itemId ?? ''}:${item.label}:${index}`}
            className={className}
            data-result-index={index}
            title={item.label}
        >
            <span className='ai-configuration-search-result-type'>{item.typeLabel}</span>
            <span className='ai-configuration-search-result-label'>{this.renderHighlightedLabel(item.label, firstTerm)}</span>
            <span className='ai-configuration-search-result-category'>{category?.label ?? ''}</span>
        </div>;
    }

    protected renderHighlightedLabel(label: string, firstTerm: string | undefined): React.ReactNode {
        if (!firstTerm) {
            return label;
        }
        const index = label.toLowerCase().indexOf(firstTerm);
        if (index < 0) {
            return label;
        }
        return <>
            {label.slice(0, index)}
            <b>{label.slice(index, index + firstTerm.length)}</b>
            {label.slice(index + firstTerm.length)}
        </>;
    }

    protected override onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (this.open && this.results.length > 0 && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => {
                const focused = this.node.querySelector<HTMLElement>('.ai-configuration-search-result.focused');
                focused?.scrollIntoView({ block: 'nearest' });
            });
        }
    }
}
