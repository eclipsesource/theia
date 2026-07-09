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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

// @lumino/dragdrop (pulled in transitively via `codicon` from `@theia/core/lib/browser`) extends the
// DragEvent DOM global at module load, which JSDOM does not provide; stub it so the import succeeds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(global as any).DragEvent) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).DragEvent = class DragEvent extends (global as any).Event { };
}

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { AiConfigurationItemCard } from './ai-configuration-item-card';
import { AiConfigurationEmptyState } from './ai-configuration-empty-state';
import { AiConfigurationSection } from './ai-configuration-section';
import { AiConfigurationItemDetailHeader } from './ai-configuration-item-detail-header';
import { AiConfigurationSettingRow } from './ai-configuration-setting-row';

disableJSDOM();

/** Renders one level of an element: the output of a function component, or the children of a host element. */
function contentOf(element: React.ReactElement): React.ReactNode {
    if (typeof element.type === 'function') {
        return (element.type as (props: unknown) => React.ReactNode)(element.props);
    }
    return (element.props as { children?: React.ReactNode } | undefined)?.children;
}

/** Recursively collects the class names present anywhere in a rendered element tree. */
function classNames(node: React.ReactNode, into: string[] = []): string[] {
    if (!node || typeof node !== 'object') {
        return into;
    }
    if (Array.isArray(node)) {
        node.forEach(child => classNames(child, into));
        return into;
    }
    const element = node as React.ReactElement<{ className?: string }>;
    if (element.props?.className) {
        into.push(...element.props.className.split(/\s+/).filter(Boolean));
    }
    classNames(contentOf(element), into);
    return into;
}

/** Recursively collects the string text present anywhere in a rendered element tree. */
function textOf(node: React.ReactNode, into: string[] = []): string[] {
    if (node === undefined || node === false) {
        return into;
    }
    if (typeof node === 'string' || typeof node === 'number') {
        into.push(String(node));
        return into;
    }
    if (Array.isArray(node)) {
        node.forEach(child => textOf(child, into));
        return into;
    }
    if (typeof node === 'object') {
        textOf(contentOf(node as React.ReactElement), into);
    }
    return into;
}

describe('AI Configuration primitives', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('AiConfigurationSection renders its title and children', () => {
        const tree = AiConfigurationSection({ title: 'General', children: React.createElement('span', {}, 'row') });
        expect(classNames(tree)).to.include('ai-configuration-section');
        expect(textOf(tree)).to.include('General').and.to.include('row');
    });

    it('AiConfigurationItemCard exposes the label, status and an onSelect handler', () => {
        let selected = false;
        const tree = AiConfigurationItemCard({
            label: 'Universal',
            iconClass: 'codicon-hubot',
            status: { kind: 'on', label: 'Enabled' },
            onSelect: () => { selected = true; }
        }) as React.ReactElement<{ onClick: () => void }>;
        expect(textOf(tree)).to.include('Universal').and.to.include('Enabled');
        expect(classNames(tree)).to.include('ai-configuration-status-on');
        tree.props.onClick();
        expect(selected).to.equal(true);
    });

    it('AiConfigurationEmptyState renders the message and an optional action', () => {
        const tree = AiConfigurationEmptyState({ message: 'Nothing here', action: React.createElement('button', {}, 'Add') });
        expect(textOf(tree)).to.include('Nothing here').and.to.include('Add');
    });

    it('AiConfigurationItemDetailHeader renders title and subtitle', () => {
        const tree = AiConfigurationItemDetailHeader({ title: 'Coder', subtitle: 'agent-id-1' });
        expect(textOf(tree)).to.include('Coder').and.to.include('agent-id-1');
    });

    it('AiConfigurationSettingRow shows the preference id and, when modified, a reset affordance', () => {
        const modified = AiConfigurationSettingRow({
            preferenceId: 'ai-features.demo',
            title: 'Demo',
            renderMarkdown: () => document.createElement('div'),
            modified: true,
            onReset: () => { /* no-op */ },
            control: React.createElement('span', {}, 'ctrl')
        });
        expect(classNames(modified)).to.include('ai-settings-row').and.to.include('modified').and.to.include('ai-settings-row-reset');
        expect(textOf(modified)).to.include('Demo').and.to.include('ai-features.demo').and.to.include('ctrl');

        const pristine = AiConfigurationSettingRow({
            preferenceId: 'ai-features.demo',
            title: 'Demo',
            renderMarkdown: () => document.createElement('div'),
            modified: false,
            onReset: () => { /* no-op */ }
        });
        expect(classNames(pristine)).to.not.include('modified').and.to.not.include('ai-settings-row-reset');
    });

    it('AiConfigurationSettingRow places a full-width control in the below slot', () => {
        const tree = AiConfigurationSettingRow({
            preferenceId: 'ai-features.demo',
            title: 'Demo',
            renderMarkdown: () => document.createElement('div'),
            modified: false,
            onReset: () => { /* no-op */ },
            below: React.createElement('span', {}, 'wide')
        });
        expect(classNames(tree)).to.include('ai-settings-row-below');
        expect(textOf(tree)).to.include('wide');
    });
});
