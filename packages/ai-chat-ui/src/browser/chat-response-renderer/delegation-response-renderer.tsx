// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent } from '@theia/ai-chat';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import * as React from '@theia/core/shared/react';
import { ResponseNode } from '../chat-tree-view';
import { DelegationResponseContent, isDelegationResponseContent } from '@theia/ai-chat/lib/browser/delegation-response-content';

@injectable()
export class DelegationResponseRenderer implements ChatResponsePartRenderer<DelegationResponseContent> {
    canHandle(response: ChatResponseContent): number {
        if (isDelegationResponseContent(response)) {
            return 10;
        }
        return -1;
    }
    render(response: DelegationResponseContent, parentNode: ResponseNode): React.ReactNode {
        return this.renderExpandableNode(response);
    }

    private renderExpandableNode(_response: DelegationResponseContent): React.ReactNode {
        return (
            <details className='delegation-response-container'>
                <summary className='delegation-response-summary'>
                    TODO TITLE
                </summary>
                <div className='delegation-response-content'>
                    {/* Content will be added here later */}
                    <div className='delegation-response-placeholder'>
                        Content placeholder
                    </div>
                </div>
            </details>
        );
    }

}
