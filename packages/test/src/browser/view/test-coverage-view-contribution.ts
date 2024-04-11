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

import { AbstractViewContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TestService } from '../test-service';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { TEST_VIEW_CONTAINER_ID } from './test-view-contribution';
import { nls } from '@theia/core';
import { TestCoverageTreeWidget } from './test-coverage-widget';

export const TEST_COVERAGE_CONTEXT_MENU = ['test-coverage-context-menu'];
export const TEST_COVERAGE_INLINE_MENU = [...TEST_COVERAGE_CONTEXT_MENU, 'inline'];

@injectable()
export class TestCoverageViewContribution extends AbstractViewContribution<TestCoverageTreeWidget> {

    @inject(TestService) protected readonly testService: TestService;
    @inject(ContextKeyService) protected readonly contextKeys: ContextKeyService;

    constructor() {
        super({
            viewContainerId: TEST_VIEW_CONTAINER_ID,
            widgetId: TestCoverageTreeWidget.ID,
            widgetName: nls.localizeByDefault('Test Coverage'),
            defaultWidgetOptions: {
                area: 'left',
                rank: 300,
            }
        });
    }
}
