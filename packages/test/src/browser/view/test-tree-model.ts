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

import { injectable, inject } from '@theia/core/shared/inversify';
import { TreeModelImpl, TreeNode, CompositeTreeNode, SelectableTreeNode } from '@theia/core/lib/browser/tree';
import { DefaultTestService, TestController, TestItem, TestService } from '../test-service';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';


export interface TestControllerRootNode extends CompositeTreeNode {
    testController: TestController;
    children: TestItemTreeNode[];
}

export interface TestItemTreeNode extends SelectableTreeNode {
    name: string;
    testItem: TestItem;
    children: TestItemTreeNode[];
}

export namespace TestItemTreeNode {
    export function is(node: TreeNode): node is TestItemTreeNode {
        return 'testItem' in node && 'children' in node;
    }
}

@injectable()
export class TestTreeModel extends TreeModelImpl {

    @inject(DefaultTestService) protected readonly testService: TestService;
    @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService;

    async updateTree(): Promise<void> {
        const root = {
            id: 'test-tree-root',
            parent: undefined,
            visible: false,
            children: []
        } as CompositeTreeNode;

        // we should ask the test service for all current controllers, and also listen for new ones.
        for (const testController of this.testService.getControllers()) {
            const children = testController.tests.map(item => this.toTestItemTreeNode(item, root));
            root.children = [...children]; // should collect for each controller!
        }

        // fill test items? lazy? 
        this.root = root;

    }

    toTestItemTreeNode(testItem: TestItem, parent: CompositeTreeNode): TestItemTreeNode {
        return {
            name: testItem.label,
            expanded: false,
            selected: false,
            id: testItem.id,
            parent: parent,
            children: [],
            testItem: testItem
        } as TestItemTreeNode;
    }

}
/* 
function complete(partial: Partial<TestItem>): TestItem | undefined {
    console.log('id:' + partial.id);
    console.log('labl:' + partial.label);
    console.log('range:' + partial.range);
    console.log('uri:' + partial.uri);
    console.log('buzy:' + partial.busy);
    console.log('canResolveChildren:' + partial.canResolveChildren);
    console.log('children:' + partial.children);
    console.log('tags:' + partial.tags);
    if (partial.id && partial.uri && partial.children)
        return Object.assign({
            id: partial.id,
            label: partial.label ? partial.label : 'no-label',
            range: partial.range ? partial.range : { start: 0, end: 0 },
            tags: partial.tags ? partial.tags : [],
            sortKey: partial.sortKey,
            uri: partial.uri,
            busy: partial.busy ? partial.busy : false,
            canResolveChildren: partial.canResolveChildren ? partial.canResolveChildren : true,
            children: partial.children,
            description: partial.description,
            error: partial.error
        }, partial);
}

 */
