// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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


import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { TreeWidget, TreeModel, TreeProps, CompositeTreeNode, TreeNode, TreeImpl, SelectableTreeNode } from '@theia/core/lib/browser/tree';
import { ContextMenuRenderer, LabelProvider, codicon } from '@theia/core/lib/browser';
import { IconThemeService } from '@theia/core/lib/browser/icon-theme-service';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core';
import { TestExecutionStateManager } from './test-execution-state-manager';
import { FileCoverage, Folder, TestCoverageService } from '../test-coverage-service';

const ROOT_ID = 'TestCoverageTree';

class FolderNode implements TreeNode, SelectableTreeNode {
    constructor(readonly id: string, readonly name: string, readonly folder: Folder, readonly parent: CompositeTreeNode) { }
    expanded?: boolean;
    selected: boolean = false;
    children: FolderOrFileCoverageNode[];
}

class FileCoverageNode implements TreeNode, SelectableTreeNode {
    constructor(readonly id: string, readonly name: string, readonly fileCoverage: FileCoverage, readonly parent: FolderNode) { }
    selected: boolean = false;
}

export type FolderOrFileCoverageNode = FolderNode | FileCoverageNode;

export interface FileNode extends TreeNode {
    path: string;
    fileCoverage: FileCoverage;
}

export namespace FileNode {
    export function is(node: unknown): node is FileNode {
        return TreeNode.is(node) && 'fileCoverage' in node;
    }
}

@injectable()
export class TestCoverageTree extends TreeImpl {

    private ROOT: CompositeTreeNode = {
        id: 'TestCoverage',
        name: 'Test Coverage',
        parent: undefined,
        children: [],
        visible: false
    };

    @inject(TestCoverageService) protected readonly testCoverageService: TestCoverageService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    @postConstruct()
    init(): void {
        console.log(ROOT_ID + this.testCoverageService);
        this.root = this.ROOT;
        // this.testCoverageService.getRootFolders().forEach(folder => this.addRootFolder(folder));
    }

    protected createFolderNode(folder: Folder, parent: CompositeTreeNode): FolderNode {
        return new FolderNode(`folder-${folder.uri}`, folder.name, folder, parent);
    }

    protected createFileCoverageNode(fileCoverage: FileCoverage, parent: FolderNode) {
        const name = this.labelProvider.getName(fileCoverage.uri);
        return new FileCoverageNode(`coverage-${fileCoverage.uri}`, name, fileCoverage, parent);
    }

    protected override async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (parent === this.ROOT) {
            return Promise.resolve(this.testCoverageService.getRootFolders().map(folder => this.createFolderNode(folder, this.ROOT)));
        } else if (parent instanceof FolderNode) {
            let children = [
                ...parent.folder.folders.map(childFolder => this.createFolderNode(childFolder, parent)),
                ...parent.folder.fileCoverages.map(fileCoverage => this.createFileCoverageNode(fileCoverage, parent))
            ];
            return Promise.resolve(children);
        } else {
            return Promise.resolve([]);
        }
    }
}

@injectable()
export class TestCoverageTreeWidget extends TreeWidget {

    static ID = 'test-coverage-widget';

    @inject(IconThemeService) protected readonly iconThemeService: IconThemeService;
    @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService;
    @inject(ThemeService) protected readonly themeService: ThemeService;
    @inject(TestExecutionStateManager) protected readonly stateManager: TestExecutionStateManager;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
    ) {
        super(props, model, contextMenuRenderer);
        this.id = TestCoverageTreeWidget.ID;
        this.title.label = 'Test Coverage';
        this.title.caption = 'Test Coverage';
        this.title.iconClass = codicon('debug-coverage');
        this.title.closable = true;
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.addClass('theia-test-coverage-view');
        /*this.model.onSelectionChanged(() => {
            const node = this.model.selectedNodes[0];
            if (node instanceof TestRunNode) {
                this.uiModel.selectedOutputSource = {
                    get output(): readonly TestOutputItem[] {
                        return node.run.getOutput();
                    },
                    onDidAddTestOutput: Event.map(node.run.onDidChangeTestOutput, evt => evt.map(item => item[1]))
                };
            } else if (node instanceof TestItemNode) {
                this.uiModel.selectedOutputSource = {
                    get output(): readonly TestOutputItem[] {
                        return node.parent.run.getOutput(node.item);
                    },
                    onDidAddTestOutput: Event.map(node.parent.run.onDidChangeTestOutput, evt => evt.filter(item => item[0] === node.item).map(item => item[1]))
                };
                this.uiModel.selectedTestState = node.parent.run.getTestState(node.item);
            }
        });*/
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        if (CompositeTreeNode.is(this.model.root) && this.model.root.children.length > 0) {
            return super.renderTree(model);
        }
        return <div className='theia-widget-noInfo noMarkers'>{nls.localizeByDefault('No test coverage have been found in this workspace yet.')}</div>;
    }

    /*
    protected override renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        if (node instanceof TestItemNode) {
            const state = node.parent.run.getTestState(node.item)?.state;
            return <div className={this.getTestStateClass(state)}></div >;
        } else if (node instanceof TestRunNode) {
            const icon = node.run.isRunning ? `${codicon('sync')} codicon-modifier-spin running` : codicon('circle');
            return <div className={icon}></div >;
        } else {
            return super.renderIcon(node, props);
        }
    }

    protected override toContextMenuArgs(node: SelectableTreeNode): (TestRun | TestItem | TestMessage[])[] {
        if (node instanceof TestRunNode) {
            return [node.run];
        } else if (node instanceof TestItemNode) {
            const item = node.item;
            const executionState = node.parent.run.getTestState(node.item);
            if (TestFailure.is(executionState)) {
                return [item, executionState.messages];
            }
            return [item];
        }
        return [];
    }*/

    override storeState(): object {
        return {}; // don't store any state for now
    }
}

