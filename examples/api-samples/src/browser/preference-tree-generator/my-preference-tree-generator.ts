// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { injectable, interfaces } from '@theia/core/shared/inversify';
import { COMMONLY_USED_SECTION_PREFIX, PreferenceTreeGenerator } from '@theia/preferences/lib/browser/util/preference-tree-generator';

@injectable()
class MyPreferenceTreeGenerator extends PreferenceTreeGenerator {
    protected override readonly commonlyUsedPreferences = [
        'files.autoSave', 'files.autoSaveDelay', 'editor.fontSize',
        'editor.fontFamily', 'editor.tabSize', 'editor.renderWhitespace',
        'editor.cursorStyle', 'editor.multiCursorModifier', 'editor.insertSpaces',
        'editor.wordWrap', 'files.exclude', 'files.associations'
    ];
    protected override readonly topLevelCategories = new Map([
        [COMMONLY_USED_SECTION_PREFIX, 'Commonly Used'],
        ['editor', 'Text Editor'],
        ['workbench', 'Workbench'],
        ['window', 'Window'],
        ['features', 'Features'],
        ['application', 'Application'],
        ['security', 'Security'],
        ['extensions', 'Extensions']
    ]);
    protected override readonly sectionAssignments = new Map([
        ['breadcrumbs', 'workbench'],
        ['comments', 'features'],
        ['debug', 'features'],
        ['diffEditor', 'editor'],
        ['explorer', 'features'],
        ['extensions', 'features'],
        ['files', 'editor'],
        ['hosted-plugin', 'features'],
        ['http', 'application'],
        ['keyboard', 'application'],
        ['notification', 'workbench'],
        ['output', 'features'],
        ['preview', 'features'],
        ['problems', 'features'],
        ['scm', 'features'],
        ['search', 'features'],
        ['task', 'features'],
        ['terminal', 'features'],
        ['toolbar', 'features'],
        ['webview', 'features'],
        ['workspace', 'application'],
    ]);
}

export const bindMyPreferenceTreeGenerator = (bind: interfaces.Bind,
    _unbind: interfaces.Unbind,
    isBound: interfaces.IsBound,
    rebind: interfaces.Rebind) => {
    bind(MyPreferenceTreeGenerator).toSelf().inSingletonScope();
    if (isBound(PreferenceTreeGenerator)) {
        rebind(PreferenceTreeGenerator).to(MyPreferenceTreeGenerator).inSingletonScope();
    } else {
        bind(PreferenceTreeGenerator).to(MyPreferenceTreeGenerator).inSingletonScope();
    }
};
