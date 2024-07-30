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
// *****************************************************************************

import { BaseWidget, BoxLayout, codicon, DockPanel, WidgetManager } from '@theia/core/lib/browser';
import { TheiaDockPanel } from '@theia/core/lib/browser/shell/theia-dock-panel';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import '../../src/browser/style/index.css';
import { AIAgentConfigurationContainerWidget } from './agent-configuration/agent-configuration-widget';
import { AIVariableConfiguratioContainerWidget } from './agent-configuration/variable-configuration-widget';

@injectable()
export class AIAgentConfigurationWidget extends BaseWidget {

    static readonly ID = 'ai-agent-configuration';
    static readonly LABEL = 'AI Agent Configuration';
    protected dockpanel: DockPanel;

    @inject(TheiaDockPanel.Factory)
    protected readonly dockPanelFactory: TheiaDockPanel.Factory;
    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @postConstruct()
    protected init(): void {
        this.id = AIAgentConfigurationWidget.ID;
        this.title.label = AIAgentConfigurationWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = codicon('hubot');
        this.initUI();
    }

    protected async initUI(): Promise<void> {
        const layout = (this.layout = new BoxLayout({ direction: 'top-to-bottom', spacing: 0 }));
        this.dockpanel = this.dockPanelFactory({
            mode: 'multiple-document',
            spacing: 0
        });
        BoxLayout.setStretch(this.dockpanel, 1);
        layout.addWidget(this.dockpanel);

        this.dockpanel.addWidget(await this.widgetManager.getOrCreateWidget(AIAgentConfigurationContainerWidget.ID));
        this.dockpanel.addWidget(await this.widgetManager.getOrCreateWidget(AIVariableConfiguratioContainerWidget.ID));
        this.update();
    }
}
