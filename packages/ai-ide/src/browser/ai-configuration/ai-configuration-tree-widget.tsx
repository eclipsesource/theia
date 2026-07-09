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
import { Container, inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import {
    CompositeTreeNode, ContextMenuRenderer, createTreeContainer, ExpandableTreeNode, NodeProps, SelectableTreeNode,
    TreeModel, TreeNode, TreeProps, TreeWidget
} from '@theia/core/lib/browser';
import { AiConfigurationCategoryRegistry } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category-registry';
import { AiConfigurationSelectionModel } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-selection-model';
import { AiConfigurationSelection } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationTreeModel } from './ai-configuration-tree-model';
import { AiConfigurationCategoryNode, AiConfigurationItemNode, AiConfigurationSeparatorNode, AiConfigurationTree } from './ai-configuration-tree-nodes';
import { AiConfigurationSearch } from './ai-configuration-search';

@injectable()
export class AiConfigurationTreeWidget extends TreeWidget {

    static readonly ID = 'ai-configuration-tree';

    @inject(AiConfigurationCategoryRegistry)
    protected readonly registry: AiConfigurationCategoryRegistry;

    @inject(AiConfigurationSelectionModel)
    protected readonly selectionModel: AiConfigurationSelectionModel;

    /** Guards the tree ↔ selection-model round trip against re-entrant updates. */
    protected updatingSelection = false;
    /** Set while a rebuild is in flight, so selection is restored once the tree is refreshed. */
    protected pendingSelectionRestore = false;
    protected expansionState = new Map<string, boolean>();

    /** Active live-filter terms (empty => no filtering). */
    protected filterTerms: string[] = [];
    /** Expansion snapshot captured when filtering starts, restored when it ends. */
    protected preFilterExpansion: Map<string, boolean> | undefined;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.id = AiConfigurationTreeWidget.ID;
        this.addClass('ai-configuration-tree');
        this.toDispose.push(this.registry.onDidChange(() => this.buildTree()));
        this.toDispose.push(this.model.onChanged(() => this.onModelChanged()));
        this.toDispose.push(this.model.onSelectionChanged(() => this.handleTreeSelectionChanged()));
        this.toDispose.push(this.selectionModel.onDidChangeSelection(selection => this.reflectSelection(selection)));
        this.buildTree();
    }

    protected buildTree(): void {
        this.expansionState = this.captureExpansion();
        this.pendingSelectionRestore = true;
        this.model.root = AiConfigurationTree.buildRoot(this.registry.getCategories(), {
            isExpanded: categoryId => this.expansionState.get(categoryId)
        });
    }

    protected captureExpansion(): Map<string, boolean> {
        const state = new Map<string, boolean>();
        const root = this.model.root;
        if (CompositeTreeNode.is(root)) {
            for (const child of root.children) {
                if (AiConfigurationCategoryNode.is(child) && ExpandableTreeNode.is(child)) {
                    state.set(child.categoryId, child.expanded);
                }
            }
        }
        return state;
    }

    /** Restores the selection after a rebuild once the target node has been indexed. */
    protected onModelChanged(): void {
        if (!this.pendingSelectionRestore) {
            return;
        }
        const selection = this.selectionModel.getSelection();
        if (!selection) {
            this.pendingSelectionRestore = false;
            return;
        }
        // Expand the owning category so an item child gets indexed on the next refresh.
        if (selection.itemId) {
            const categoryNode = this.model.getNode(AiConfigurationTree.categoryNodeId(selection.categoryId));
            if (ExpandableTreeNode.is(categoryNode) && !categoryNode.expanded) {
                this.model.expandNode(categoryNode);
            }
        }
        const node = this.model.getNode(this.selectionNodeId(selection));
        if (SelectableTreeNode.is(node)) {
            this.pendingSelectionRestore = false;
            this.applyTreeSelection(node);
        }
    }

    /** Selection model → tree. */
    protected reflectSelection(selection: AiConfigurationSelection | undefined): void {
        if (!selection) {
            return;
        }
        const node = this.model.getNode(this.selectionNodeId(selection));
        if (SelectableTreeNode.is(node)) {
            if (!node.selected) {
                this.applyTreeSelection(node);
            }
        } else {
            // The node is not indexed yet (e.g. during a rebuild); restore on the next refresh.
            this.pendingSelectionRestore = true;
        }
    }

    /** Tree → selection model. */
    protected handleTreeSelectionChanged(): void {
        if (this.updatingSelection) {
            return;
        }
        const node = this.model.selectedNodes[0];
        if (AiConfigurationItemNode.is(node)) {
            this.selectionModel.select({ categoryId: node.categoryId, itemId: node.itemId });
        } else if (AiConfigurationCategoryNode.is(node)) {
            this.selectionModel.select({ categoryId: node.categoryId });
        }
    }

    protected applyTreeSelection(node: SelectableTreeNode): void {
        this.updatingSelection = true;
        try {
            if (AiConfigurationItemNode.is(node) && ExpandableTreeNode.is(node.parent) && !node.parent.expanded) {
                this.model.expandNode(node.parent);
            }
            this.model.selectNode(node);
        } finally {
            this.updatingSelection = false;
        }
    }

    protected selectionNodeId(selection: AiConfigurationSelection): string {
        return selection.itemId
            ? AiConfigurationTree.itemNodeId(selection.categoryId, selection.itemId)
            : AiConfigurationTree.categoryNodeId(selection.categoryId);
    }

    /**
     * Live tree filter driven by the search box: hides non-matching category/item
     * nodes and the separator, and (un)expands categories so matches stay visible.
     */
    setFilter(text: string): void {
        const terms = AiConfigurationSearch.terms(text);
        const wasFiltering = this.filterTerms.length > 0;
        const nowFiltering = terms.length > 0;
        this.filterTerms = terms;
        if (nowFiltering) {
            if (!wasFiltering) {
                this.preFilterExpansion = this.captureExpansion();
            }
            this.expandMatchingCategories();
        } else if (wasFiltering) {
            this.restoreExpansion();
        }
        this.updateRows();
    }

    protected expandMatchingCategories(): void {
        const root = this.model.root;
        if (!CompositeTreeNode.is(root)) {
            return;
        }
        for (const child of root.children) {
            if (AiConfigurationCategoryNode.is(child) && ExpandableTreeNode.is(child) && !child.expanded && this.matchesFilter(child)) {
                this.model.expandNode(child);
            }
        }
    }

    protected restoreExpansion(): void {
        const state = this.preFilterExpansion;
        this.preFilterExpansion = undefined;
        const root = this.model.root;
        if (!state || !CompositeTreeNode.is(root)) {
            return;
        }
        for (const child of root.children) {
            if (AiConfigurationCategoryNode.is(child) && ExpandableTreeNode.is(child)) {
                const wasExpanded = state.get(child.categoryId) ?? false;
                if (wasExpanded && !child.expanded) {
                    this.model.expandNode(child);
                } else if (!wasExpanded && child.expanded) {
                    this.model.collapseNode(child);
                }
            }
        }
    }

    protected override shouldDisplayNode(node: TreeNode): boolean {
        if (!super.shouldDisplayNode(node)) {
            return false;
        }
        if (this.filterTerms.length === 0) {
            return true;
        }
        if (AiConfigurationSeparatorNode.is(node)) {
            return false;
        }
        return this.matchesFilter(node);
    }

    /** A category matches if its own label or any child matches; an item matches if its label or its category's label matches. */
    protected matchesFilter(node: TreeNode): boolean {
        if (AiConfigurationCategoryNode.is(node)) {
            return this.labelMatches(node.name) || node.children.some(child => this.labelMatches(child.name));
        }
        if (AiConfigurationItemNode.is(node)) {
            return this.labelMatches(node.name)
                || (AiConfigurationCategoryNode.is(node.parent) && this.labelMatches(node.parent.name));
        }
        return false;
    }

    protected labelMatches(label: string | undefined): boolean {
        if (!label) {
            return false;
        }
        return AiConfigurationSearch.matchesTerms(label.toLowerCase(), this.filterTerms);
    }

    protected override renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        if (AiConfigurationCategoryNode.is(node) || AiConfigurationItemNode.is(node)) {
            return <div className={`ai-configuration-tree-node-icon ${node.iconClass}`}></div>;
        }
        return super.renderIcon(node, props);
    }

    protected override createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (AiConfigurationSeparatorNode.is(node)) {
            classNames.push('ai-configuration-tree-separator');
        }
        return classNames;
    }
}

export function createAiConfigurationTreeContainer(parent: interfaces.Container): Container {
    return createTreeContainer(parent, {
        model: AiConfigurationTreeModel,
        widget: AiConfigurationTreeWidget,
        props: {
            virtualized: false,
            search: false,
            leftPadding: 8,
            expandOnlyOnExpansionToggleClick: true
        }
    });
}
