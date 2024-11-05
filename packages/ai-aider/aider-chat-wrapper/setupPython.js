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

const { spawnSync } = require('child_process');
const os = require('os');

function setupPythonEnv() {
    const isWindows = os.platform() === 'win32';
    const activateCmd = isWindows ? '.\\aider-chat-wrapper\\venv\\Scripts\\activate' : 'source ./aider-chat-wrapper/venv/bin/activate';

    // Create a virtual environment
    spawnSync('python3', ['-m', 'venv', './aider-chat-wrapper/venv'], { stdio: 'inherit' });

    // Install Python dependencies
    spawnSync(activateCmd && 'pip', ['install', '-r', './aider-chat-wrapper/requirements.txt'], { stdio: 'inherit' });
}

setupPythonEnv();
