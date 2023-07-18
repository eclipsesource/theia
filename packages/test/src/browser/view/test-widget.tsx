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

/* eslint-disable no-null/no-null, @typescript-eslint/no-explicit-any */

import { Message } from '@theia/core/shared/@phosphor/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    BaseWidget, Panel, PanelLayout, ApplicationShell, MessageLoop
} from '@theia/core/lib/browser';
import { DefaultTestService, TestService } from '../test-service';
import { NoTestWidget } from './test-no-test-widget';
import { nls } from '@theia/core';
import { TestTreeWidget } from './test-tree-widget';
// import { TestTreeWidget } from './test-tree-widget';

@injectable()
export class TestWidget extends BaseWidget {

    protected panel: Panel;

    static ID = 'test-view';

    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(TestTreeWidget) readonly testTreeWidget: TestTreeWidget;
    @inject(NoTestWidget) protected readonly noTestWidget: NoTestWidget;
    @inject(DefaultTestService) protected readonly testService: TestService;

    constructor() {
        super();
        this.id = TestWidget.ID;
        this.title.label = nls.localizeByDefault('Testing');
        this.addClass('theia-test');
        this.addClass('theia-test-main-container');
    }


    @postConstruct()
    protected init(): void {
        const layout = new PanelLayout();
        this.layout = layout;
        this.panel = new Panel({ layout: new PanelLayout({}) });
        this.panel.node.tabIndex = -1;
        this.panel.node.setAttribute('class', 'theia-test-panel');
        layout.addWidget(this.panel);

        this.containerLayout.addWidget(this.testTreeWidget);
        this.containerLayout!.addWidget(this.noTestWidget);
        this.toDispose.push(this.testService.onControllersChanged(() => this.refresh()));
        this.testTreeWidget.model.updateTree();
        this.refresh();
    }

    get containerLayout(): PanelLayout {
        return this.panel.layout as PanelLayout;
    }

    protected refresh(): void {
        if (this.hasTests()) {
            this.testTreeWidget.show();
            this.noTestWidget.hide();
        } else {
            this.testTreeWidget.hide();
            this.noTestWidget.show();
        }
    }

    protected hasTests(): boolean {
        // return true;
        return this.testService.getControllers().length > 0;
    }

    protected override onUpdateRequest(msg: Message): void {
        MessageLoop.sendMessage(this.noTestWidget, msg);
        MessageLoop.sendMessage(this.testTreeWidget, msg);
        this.refresh();
        super.onUpdateRequest(msg);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.refresh();
        this.node.focus();
    }

    protected override onAfterAttach(msg: Message): void {
        this.node.appendChild(this.noTestWidget.node);
        this.node.appendChild(this.testTreeWidget.node);
        super.onAfterAttach(msg);
        this.update();
    }
}
