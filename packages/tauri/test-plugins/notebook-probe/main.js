// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const vscode = require('vscode');

exports.activate = context => {
    console.log('TAURI_NOTEBOOK_PROBE_ACTIVATED');
    context.subscriptions.push(vscode.workspace.registerNotebookSerializer('tauri-probe-notebook', {
        async deserializeNotebook(data) {
            console.log(`TAURI_NOTEBOOK_DESERIALIZE ${data.byteLength}`);
            const cells = [
                new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, '# Tauri notebook probe', 'markdown'),
                new vscode.NotebookCellData(vscode.NotebookCellKind.Code, '1 + 1', 'javascript')
            ];
            return new vscode.NotebookData(cells);
        },
        async serializeNotebook(data) {
            console.log(`TAURI_NOTEBOOK_SERIALIZE ${data.cells.length}`);
            return Buffer.from(JSON.stringify({ cells: data.cells.length }));
        }
    }));
    const kernel = vscode.notebooks.createNotebookController('tauri-probe-kernel', 'tauri-probe-notebook', 'Tauri Probe Kernel');
    kernel.supportedLanguages = ['javascript'];
    kernel.executeHandler = async cells => {
        for (const cell of cells) {
            const execution = kernel.createNotebookCellExecution(cell);
            execution.start(Date.now());
            const item = new vscode.NotebookCellOutputItem(Buffer.from('2'), 'application/x-tauri-probe');
            await execution.replaceOutput([new vscode.NotebookCellOutput([item])]);
            execution.end(true, Date.now());
            console.log('TAURI_NOTEBOOK_CELL_EXECUTED');
        }
    };
    context.subscriptions.push(kernel);
    context.subscriptions.push(vscode.commands.registerCommand('tauriProbe.openNotebook', async () => {
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        const uri = vscode.Uri.joinPath(context.globalStorageUri, 'sample.tauri-nb');
        await vscode.workspace.fs.writeFile(uri, Buffer.from('{}'));
        const document = await vscode.workspace.openNotebookDocument(uri);
        console.log(`TAURI_NOTEBOOK_OPENED ${document.notebookType} ${document.cellCount}`);
        await vscode.window.showNotebookDocument(document);
        console.log('TAURI_NOTEBOOK_SHOWN');
    }));
};
