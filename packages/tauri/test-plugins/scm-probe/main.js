// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const vscode = require('vscode');

exports.activate = context => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        console.log('TAURI_SCM_PROBE_NO_WORKSPACE');
        return;
    }

    const sourceControl = vscode.scm.createSourceControl('tauri-probe-scm', 'Tauri Probe', folder.uri);
    const changes = sourceControl.createResourceGroup('changes', 'Changes');
    sourceControl.inputBox.placeholder = 'Tauri probe commit message';
    context.subscriptions.push(sourceControl, changes);
    console.log(`TAURI_SCM_PROBE_REGISTERED ${folder.uri.toString()}`);

    context.subscriptions.push(vscode.commands.registerCommand('tauriProbe.openScmFile', uri => {
        console.log(`TAURI_SCM_PROBE_OPEN ${uri.toString()}`);
        return vscode.window.showTextDocument(uri);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tauriProbe.populateScm', async () => {
        const uri = vscode.Uri.joinPath(folder.uri, 'tauri-scm-probe.txt');
        try {
            await vscode.workspace.fs.stat(uri);
        } catch (error) {
            if (error.code !== 'FileNotFound') {
                throw error;
            }
            await vscode.workspace.fs.writeFile(uri, Buffer.from('Tauri SCM probe\n'));
        }
        changes.resourceStates = [{
            resourceUri: uri,
            command: { command: 'tauriProbe.openScmFile', title: 'Open Probe', arguments: [uri] },
            decorations: { tooltip: 'Tauri SCM probe change', strikeThrough: false }
        }];
        console.log(`TAURI_SCM_PROBE_POPULATED ${changes.resourceStates.length}`);
    }));
};
