// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const { ContainerModule } = require('@theia/core/shared/inversify');
const { TauriMainApplicationContribution } = require('@theia/core/lib/tauri-main/tauri-main-application');

// Exercises discovery and lifecycle wiring through the normal extension manifest.
module.exports.default = new ContainerModule(bind => {
    bind(TauriMainApplicationContribution).toConstantValue({
        onStart: () => console.info('Tauri lifecycle fixture started'),
        onStop: () => console.info('Tauri lifecycle fixture stopped')
    });
});
