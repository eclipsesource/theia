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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { AiConfigurationItemCard } from './ai-configuration-item-card';
import { AiConfigurationEmptyState } from './ai-configuration-empty-state';
import { AiConfigurationSection } from './ai-configuration-section';
import { AiConfigurationItemDetailHeader } from './ai-configuration-item-detail-header';

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
});
