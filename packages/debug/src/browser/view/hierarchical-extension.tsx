// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Mutable, nls } from '@theia/core';
import { NodeProps, TreeNode } from '@theia/core/lib/browser';
import { CompositeTreeElement, SourceTreeWidget, TreeElement } from '@theia/core/lib/browser/source-tree';
import { Container, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugAdapterPath, DebugChannel, ForwardingDebugChannel } from '../../common/debug-service';
import { DebugSession } from '../debug-session';
import { DebugSessionConnection } from '../debug-session-connection';
import { DefaultDebugSessionFactory } from '../debug-session-contribution';
import { DebugConfigurationSessionOptions } from '../debug-session-options';
import { DebugThread, DebugThreadData, StoppedDetails } from '../model/debug-thread';
import { DebugThreadsSource } from './debug-threads-source';
import { DebugThreadsWidget } from './debug-threads-widget';

@injectable()
export class HierarchicalDebugThreadsWidget extends DebugThreadsWidget {
    static override createContainer(parent: interfaces.Container): Container {
        const child = DebugThreadsWidget.createContainer(parent);
        child.rebind(DebugThreadsWidget).to(HierarchicalDebugThreadsWidget);
        child.rebind(DebugThreadsSource).to(HierarchicalDebugThreadsSource);
        return child;
    }

    static override createWidget(parent: interfaces.Container): DebugThreadsWidget {
        return HierarchicalDebugThreadsWidget.createContainer(parent).get(DebugThreadsWidget);
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.title.label = nls.localizeByDefault('Debug');
    }

    protected override getDefaultNodeStyle(node: TreeNode, props: NodeProps): React.CSSProperties | undefined {
        return SourceTreeWidget.prototype['getDefaultNodeStyle'].call(this, node, props);
    }
}

@injectable()
export class HierarchicalDebugThreadsSource extends DebugThreadsSource {
    override *getElements(): IterableIterator<TreeElement> {
        if (this.model.sessionCount === 1 && this.model.session && this.model.session.threadCount) {
            // adaptation: do not call threads but instead getElements()
            return yield* this.model.session.getElements();
        }
        for (const session of this.model.sessions) {
            if (!session.parentSession) {
                yield session;
            }
        }
    }
}

@injectable()
export class HierarchicalDebugSessionFactory extends DefaultDebugSessionFactory {
    override get(sessionId: string, options: DebugConfigurationSessionOptions, parentSession?: DebugSession): DebugSession {
        const connection = new DebugSessionConnection(
            sessionId,
            () => new Promise<DebugChannel>(resolve =>
                this.connectionProvider.openChannel(`${DebugAdapterPath}/${sessionId}`, wsChannel => {
                    resolve(new ForwardingDebugChannel(wsChannel));
                }, { reconnecting: false })
            ),
            this.getTraceOutputChannel());
        return new HierarchicalDebugSession(
            sessionId,
            options,
            parentSession,
            connection,
            this.terminalService,
            this.editorManager,
            this.breakpoints,
            this.labelProvider,
            this.messages,
            this.fileService,
            this.debugContributionProvider,
            this.workspaceService);
    }

}

export class HierarchicalDebugSession extends DebugSession {
    protected override _threads = new Map<number, HierarchicalDebugThread>();
    protected _threadsByName = new Map<string, HierarchicalDebugThread>();

    override get threads(): IterableIterator<HierarchicalDebugThread> {
        return this._threads.values();
    }

    *topLevelThreads(): IterableIterator<HierarchicalDebugThread> {
        for (const thread of this.threads) {
            if (thread.level === 0) {
                yield thread;
            }
        }
    }

    // overridden only to create our custom HierarchicalDebugThread instead of the default DebugThread
    protected override doUpdateThreads(threads: DebugProtocol.Thread[], stoppedDetails?: StoppedDetails | undefined): void {
        const existing = this._threads;
        this._threads = new Map();
        this._threadsByName = new Map();
        for (const raw of threads) {
            const id = raw.id;
            const thread = existing.get(id) || new HierarchicalDebugThread(this);
            this._threads.set(id, thread);
            const data: Partial<Mutable<DebugThreadData>> = { raw };
            this._threadsByName.set(data.raw?.name || 'unknown', thread);
            if (stoppedDetails) {
                if (stoppedDetails.threadId === id) {
                    data.stoppedDetails = stoppedDetails;
                } else if (stoppedDetails.allThreadsStopped) {
                    data.stoppedDetails = {
                        // When a debug adapter notifies us that all threads are stopped,
                        // we do not know why the others are stopped, so we should default
                        // to something generic.
                        reason: '',
                    };
                }
            }
            thread.update(data);
        }
        this.buildHierarchy();
        this.updateCurrentThread(stoppedDetails);
    }

    protected buildHierarchy(): void {
        for (const thread of this.threads) {
            const hierarchicalName = thread.raw.name.split('/');
            thread.displayName = hierarchicalName.pop() || 'unknown'; // last section of hierarchical name
            thread.level = hierarchicalName.length; // 0: root thread, 1: child, 2: grandchild, etc.
            thread.parent = this._threadsByName.get(hierarchicalName.join('/'));
        }
    }

    override *getElements(): IterableIterator<DebugThread | DebugSession> {
        const child = this.getSingleChildSession();
        if (child && child.configuration.compact) {
            // Inlines the elements of the child debug session
            return yield* child.getElements();
        }
        yield* this.topLevelThreads();
        yield* this.childSessions.values();
    }
}

export class HierarchicalDebugThread extends DebugThread implements CompositeTreeElement {
    level = 0;
    displayName: string;

    protected _parent?: HierarchicalDebugThread;
    protected _children: HierarchicalDebugThread[] = [];

    constructor(override readonly session: HierarchicalDebugSession) {
        super(session);
    }

    set parent(parent: HierarchicalDebugThread | undefined) {
        this._parent?._children.forEach((child, idx) => { if (child === this) { this._parent?._children.splice(idx, 1); } });
        this._parent = parent;
        parent?._children.push(this);
    }

    get parent(): HierarchicalDebugThread | undefined {
        return this._parent;
    }

    get hasElements(): boolean {
        return this._children.length > 0;
    }

    getElements(): IterableIterator<TreeElement> {
        return this._children.values();
    }

    // overridden to use display name instead of raw name
    override render(): React.ReactNode {
        const reason = this.stoppedDetails && this.stoppedDetails.reason;
        const status = this.stoppedDetails ? reason ? `Paused on ${reason}` : 'Paused' : 'Running';
        return <div className='theia-debug-thread' title='Thread'>
            <span className='label'>{this.displayName || this.raw.name}</span>
            <span className='status'>{status}</span>
        </div>;
    }
}
