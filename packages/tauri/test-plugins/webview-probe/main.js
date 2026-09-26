// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

const vscode = require('vscode');
const path = require('path');

exports.activate = context => {
    console.log('TAURI_PROBE_ACTIVATED');
    const persistedSecretKey = 'theia-tauri-probe-persisted-secret';
    context.secrets.get(persistedSecretKey).then(async value => {
        if (value !== undefined) {
            console.log(`TAURI_PROBE_SECRET_RESTORED ${value === 'TAURI_PERSISTED_SECRET_VALUE'}`);
            await context.secrets.delete(persistedSecretKey);
        }
    }).catch(error => console.log(`TAURI_PROBE_SECRET_RESTORE_ERROR ${String(error)}`));
    const configurePanel = (panel, stage) => {
        panel.webview.options = {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(__dirname)]
        };
        panel.webview.onDidReceiveMessage(message => console.log(`TAURI_PROBE_MESSAGE ${JSON.stringify(message)}`));
        const resource = panel.webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'resource.txt')));
        const content = currentStage => `<!doctype html><html><body><h1>Tauri probe ${currentStage}</h1>
            <script>
                const api = acquireVsCodeApi();
                api.setState({ stage: ${currentStage} });
                api.postMessage({ kind: 'ready', stage: ${currentStage} });
                fetch(${JSON.stringify(resource.toString())})
                    .then(response => response.text())
                    .then(text => api.postMessage({ kind: 'resource', stage: ${currentStage}, text }))
                    .catch(error => api.postMessage({ kind: 'error', stage: ${currentStage}, error: String(error) }));
                const socket = new WebSocket('ws://127.0.0.1:' + location.port + '/tauri-services');
                socket.onopen = () => {
                    api.postMessage({ kind: 'authority', stage: ${currentStage}, result: 'unexpected-open' });
                    socket.close();
                };
                socket.onclose = event => api.postMessage({ kind: 'authority', stage: ${currentStage}, result: 'closed', code: event.code });
                if (navigator.serviceWorker) {
                    navigator.serviceWorker.ready.then(() => api.postMessage({ kind: 'service-worker', stage: ${currentStage}, result: 'ready' }));
                } else {
                    api.postMessage({ kind: 'service-worker', stage: ${currentStage}, result: 'unavailable' });
                }
            </script></body></html>`;
        panel.webview.html = content(stage);
        context.subscriptions.push(panel);
        return content;
    };
    context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('tauriProbe', {
        async deserializeWebviewPanel(panel, state) {
            const stage = typeof state?.stage === 'number' ? state.stage : 4;
            console.log(`TAURI_PROBE_RESTORED ${stage}`);
            configurePanel(panel, stage);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tauriProbe.openWebview', () => {
        const openPanel = stage => {
            const panel = vscode.window.createWebviewPanel('tauriProbe', 'Tauri Webview Probe', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(__dirname)]
            });
            return { panel, content: configurePanel(panel, stage) };
        };
        const { panel, content } = openPanel(1);
        setTimeout(() => { if (panel.visible) { panel.webview.html = content(2); } }, 2500);
        setTimeout(() => {
            panel.dispose();
            openPanel(3);
        }, 5000);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tauriProbe.secrets', async () => {
        const key = 'theia-tauri-probe-secret';
        try {
            await context.secrets.store(key, 'TAURI_SECRET_VALUE');
            const stored = await context.secrets.get(key);
            await context.secrets.delete(key);
            const deleted = await context.secrets.get(key);
            console.log(`TAURI_PROBE_SECRETS ${JSON.stringify({ stored: stored === 'TAURI_SECRET_VALUE', deleted: deleted === undefined })}`);
        } catch (error) {
            console.log(`TAURI_PROBE_SECRETS_ERROR ${String(error)}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('tauriProbe.persistSecret', async () => {
        await context.secrets.store(persistedSecretKey, 'TAURI_PERSISTED_SECRET_VALUE');
        console.log('TAURI_PROBE_SECRET_STORED');
    }));
    context.subscriptions.push(vscode.window.registerCustomEditorProvider('tauriProbe.customEditor', {
        resolveCustomTextEditor(document, panel) {
            console.log(`TAURI_PROBE_CUSTOM_EDITOR_OPEN ${document.uri.toString()}`);
            configurePanel(panel, 5);
        }
    }, { webviewOptions: { retainContextWhenHidden: true } }));
    context.subscriptions.push(vscode.commands.registerCommand('tauriProbe.openCustomEditor', async () => {
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        const resource = vscode.Uri.joinPath(context.globalStorageUri, 'preview.tauri-probe');
        await vscode.workspace.fs.writeFile(resource, Buffer.from('Tauri custom editor probe\n'));
        await vscode.commands.executeCommand('vscode.openWith', resource, 'tauriProbe.customEditor');
    }));
};

exports.deactivate = () => console.log('TAURI_PROBE_DEACTIVATED');
