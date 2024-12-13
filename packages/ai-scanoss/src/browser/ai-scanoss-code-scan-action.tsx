// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
// ***
import { inject, injectable } from '@theia/core/shared/inversify';
import { CodeChatResponseContent } from '@theia/ai-chat';
import { CodePartRendererAction } from '@theia/ai-chat-ui/lib/browser/chat-response-renderer';
import { ScanOSSResult, ScanOSSResultMatch, ScanOSSService } from '@theia/scanoss';
import { Dialog, PreferenceService } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core';
import { ReactNode } from '@theia/core/shared/react';
import { ResponseNode } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import * as React from '@theia/core/shared/react';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';

// cached map of scanOSS results.
// 'false' is stored when not automatic check is off and it was not (yet) requested deliberately.
type ScanOSSResults = Map<string, ScanOSSResult | false>;
interface HasScanOSSResults {
    scanOSSResults: ScanOSSResults
    [key: string]: unknown;
}
function hasScanOSSResults(data: { [key: string]: unknown }): data is HasScanOSSResults {
    return 'scanOSSResults' in data && data.scanOSSResults instanceof Map;
}

@injectable()
export class ScanOSSScanButtonAction implements CodePartRendererAction {
    @inject(ScanOSSService)
    protected readonly scanService: ScanOSSService;
    @inject(MessageService)
    protected readonly messageService: MessageService;
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    priority = 30;
    render(response: CodeChatResponseContent, parentNode: ResponseNode): ReactNode {
        if (!hasScanOSSResults(parentNode.response.data)) {
            parentNode.response.data.scanOSSResults = new Map<string, ScanOSSResult>();
        }
        const scanOSSResults = parentNode.response.data.scanOSSResults as ScanOSSResults;

        return (<ScanOSSIntegration
            code={response.code}
            scanService={this.scanService}
            scanOSSResults={scanOSSResults}
            messageService={this.messageService}
            preferenceService={this.preferenceService} />);
    }
}

const ScanOSSIntegration = (props: {
    code: string,
    scanService: ScanOSSService,
    scanOSSResults: ScanOSSResults,
    messageService: MessageService,
    preferenceService: PreferenceService
}) => {
    const [automaticCheck] = React.useState(() => props.preferenceService.get('ai-features.scanoss.enableAutomaticCheck', false));
    const [scanOSSResult, setScanOSSResult] = React.useState<ScanOSSResult | 'pending' | undefined | false>(props.scanOSSResults.get(props.code));
    const scanCode = React.useCallback(async () => {
        setScanOSSResult('pending');
        const result = await props.scanService.scanContent(props.code);
        setScanOSSResult(result);
        props.scanOSSResults.set(props.code, result);
        return result;
    }, [props.code, props.scanService]);

    React.useEffect(() => {
        if (scanOSSResult === undefined) {
            if (automaticCheck) {
                scanCode();
            } else {
                props.scanOSSResults.set(props.code, false);
            }
        }
    }, []);
    const scanOSSClicked = React.useCallback(async () => {
        let scanResult = scanOSSResult;
        if (scanResult === 'pending') {
            return;
        }
        // undefined or false
        if (!scanResult) {
            scanResult = await scanCode();
        }
        if (scanResult && scanResult.type === 'match') {
            const dialog = new ScanOSSDialog(scanResult);
            dialog.open();
        }
    }, [scanOSSResult]);
    const title = scanOSSResult ? `SCANOSS - ${scanOSSResult === 'pending' ? scanOSSResult : scanOSSResult.type}` : 'SCANOSS - Perform scan';
    return <>
        <div
            className={`button theia-scanoss-logo ${scanOSSResult === 'pending' ? 'pending' : scanOSSResult ? scanOSSResult.type : ''}`}
            title={title} role='button'
            onClick={scanOSSClicked} >
            <div className='codicon codicon-circle placeholder' > </div>
        </div>
    </>;
};

export class ScanOSSDialog extends ReactDialog<void> {
    protected readonly okButton: HTMLButtonElement;

    constructor(protected result: ScanOSSResultMatch) {
        super({
            title: 'SCANOSS Results'
        });
        this.appendAcceptButton(Dialog.OK);
        this.update();
    }

    protected renderHeader(): React.ReactNode {
        return <>
            <div className='theia-scanoss-logo'></div>
            <h3>SCANOSS Results</h3>
            <div>Found a {this.result.matched} match in <a href={this.result.url}>${this.result.url}</a></div>
        </>;
    }

    protected render(): React.ReactNode {
        return <div>
            {this.renderHeader()}
            {this.renderContent()}
        </div>;
    }

    protected renderContent(): React.ReactNode {
        return <pre>
            {
                // eslint-disable-next-line no-null/no-null
                JSON.stringify(this.result.raw, null, 2)
            };
        </pre>;
    }

    get value(): undefined { return undefined; }
}
