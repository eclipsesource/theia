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

import * as React from '@theia/core/shared/react';

// The form controls used by the AI Features (General) page are the same unified controls shared by
// every AI configuration page. They live in `@theia/ai-core-ui` so that all categories render them
// identically; re-export them here so this package's existing import sites keep working.
export {
    AiChipEditor,
    AiEditInSettingsButton,
    AiEnumSelect,
    AiNumberStepper,
    AiPathInput,
    AiSessionLimitControl,
    AiTextInput,
    AiToggleSwitch
} from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';
export type { AiEnumOption, SessionLimitSpecialOption } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';

/** Renders a (trusted, already-localized) markdown description via the core renderer into a managed element. */
export const AiMarkdownDescription: React.FC<{ renderMarkdown: (markdown: string) => HTMLElement; markdown: string }> = ({ renderMarkdown, markdown }) => {
    // eslint-disable-next-line no-null/no-null
    const host = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const node = host.current;
        if (!node) {
            return;
        }
        node.replaceChildren(renderMarkdown(markdown));
        return () => node.replaceChildren();
    }, [renderMarkdown, markdown]);
    return <div className='ai-general-setting-description' ref={host}></div>;
};
