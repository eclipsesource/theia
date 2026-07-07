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

import 'reflect-metadata';

import { expect } from 'chai';
import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { bindContributionProvider } from '@theia/core/lib/common';
import { AiConfigurationCategory } from './ai-configuration-category';
import { AiConfigurationCategoryRegistry } from './ai-configuration-category-registry';

describe('AiConfigurationCategoryRegistry', () => {

    function createRegistry(): AiConfigurationCategoryRegistry {
        const container = new Container();
        container.load(new ContainerModule(bind => {
            bindContributionProvider(bind, AiConfigurationCategory);
            bind(AiConfigurationCategoryRegistry).toSelf().inSingletonScope();
        }));
        return container.get(AiConfigurationCategoryRegistry);
    }

    it('resolves to an empty list when nothing is contributed', () => {
        const registry = createRegistry();
        expect(registry.getCategories()).to.deep.equal([]);
    });

    it('aggregates an empty search index when nothing is contributed', () => {
        const registry = createRegistry();
        expect(registry.getSearchItems()).to.deep.equal([]);
    });
});
