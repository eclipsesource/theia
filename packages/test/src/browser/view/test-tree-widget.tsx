// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { TreeWidget, TreeNode, TreeModel, TreeProps, NodeProps, TREE_NODE_SEGMENT_GROW_CLASS } from '@theia/core/lib/browser/tree';
import { ContextMenuRenderer } from '@theia/core/lib/browser';
import { IconThemeService } from '@theia/core/lib/browser/icon-theme-service';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { TestControllerRootNode, TestTreeModel } from './test-tree-model';
import { TestItemTreeNode } from './test-tree-model';
import { DefaultTestService, TestItem, TestService } from '../test-service';
import { Emitter, Event } from '@theia/core';

@injectable()
export class TestTreeWidget extends TreeWidget {

    static ID = 'test-tree-widget';

    static TEST_CONTEXT_MENU = ['RESOURCE_CONTEXT_MENU'];

    @inject(IconThemeService) protected readonly iconThemeService: IconThemeService;
    @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService;
    @inject(ThemeService) protected readonly themeService: ThemeService;
    @inject(DefaultTestService) protected readonly testService: TestService;

    protected controllersTree: Map<string, TestControllerRootNode>;
    protected changeEmitter = new Emitter<Map<string, TestControllerRootNode>>();


    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) override readonly model: TestTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
    ) {
        super(props, model, contextMenuRenderer);
        this.id = TestTreeWidget.ID;
        this.addClass('groups-outer-container');

        this.controllersTree = new Map<string, TestControllerRootNode>();
        console.log(model);
        this.toDispose.push(model.onChanged(() => {
            this.changeEmitter.fire(this.controllersTree);
        }));
        this.toDispose.push(model.onNodeRefreshed(() => {
            this.changeEmitter.fire(this.controllersTree);
        }));
    }


    @postConstruct()
    protected override init(): void {
        super.init();
        this.toDispose.push(this.themeService.onDidColorThemeChange(() => this.update()));
        this.toDispose.push(this.changeEmitter);
    }

    get onChange(): Event<Map<string, TestControllerRootNode>> {
        return this.changeEmitter.event;
    }

    /**
     * Render the node given the tree node and node properties.
     * @param node the tree node.
     * @param props the node properties.
     */
    protected override renderNode(node: TreeNode, props: NodeProps): React.ReactNode {
        if (!TreeNode.isVisible(node)) {
            return undefined;
        }

        const attributes = this.createNodeAttributes(node, props);

        if (TestItemTreeNode.is(node)) {
            const content = <TestItemNode
                key={`${node.id}`}
                testItem={node.testItem}
                contextKeys={this.contextKeys}
            />;

            return React.createElement('div', attributes, content);

        }
        return super.renderNode(node, props);
    }

}

export namespace TestItemNode {
    export interface Props {
        testItem: TestItem,
        contextKeys: ContextKeyService;
    }
}

export class TestItemNode extends React.Component<TestItemNode.Props> {

    override render(): JSX.Element {
        const { description } = this.props.testItem;

        return <div className={`noWrapInfo ${TREE_NODE_SEGMENT_GROW_CLASS}`} >
            <span className='name'>{this.props.testItem.label}</span>
            <span className='label'>{description}</span>
        </div >;
    }
}

