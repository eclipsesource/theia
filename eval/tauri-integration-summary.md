---
title: Tauri integration PoC, summary of findings
project: theia
feature: tauri-int
worktree: null
branch: tauri-int
created: 2026-09-30
tool: claude
---

# Tauri integration PoC: summary of findings

Condensed from the [detailed findings](tauri-integration-findings.md), which retain the scenario steps, observed results and command lines. This summary covers what was learned, what is still open, and what has not been tested.

## Bottom line

On Linux, a Theia workbench runs with Tauri as the host for a broad set of real workflows: editing, terminals, tasks, SCM, debugging, extensions and webviews, notebooks, and SSH/dev-container remotes. Most of the work was adapting to WebKitGTK and to the lack of an Electron main process. The Theia frontend and backend architecture held up. The PoC does not show full Electron parity, a hardened security boundary, better performance, or support for anything beyond Linux/X11.

## What was built

- A `tauri` target in the application manager and CLI. Extensions contribute `frontendTauri`, `backendTauri` and `tauriMain` entries. The generator reports any Electron-only entry that has no Tauri replacement.
- A Rust host (Tauri 2) runs the native windows. A Node desktop controller starts **one backend per window**, each with its own loopback port, random token, HTTP-only cookie and WebKit data directory.
- Frontend and backend talk over a Tauri-specific raw WebSocket service channel. Native operations (window controls, dialogs, clipboard, menu, drops) go frontend → backend → controller → Rust over authenticated channels. Tauri's JavaScript `invoke` capabilities are disabled.
- Extension webviews and mini-browser previews run on a separate `::1` content server (`*.webview.localhost`, `*.mini-browser.localhost`). That server never accepts the trusted service WebSocket.
- Remote support uses a separate `remote-main.js` backend, authenticated with its own session token. The local backend forwards traffic to it through a session-scoped gateway (`/tauri-remote/<session>/…`), so the window stays on its local origin.
- Linux packaging: `package:tauri` and `package:electron` build a folder, a `.tar.gz` and a `.deb` (see `doc/DesktopPackaging.md`). The Tauri package bundles a Node runtime and uses the system WebKitGTK.

## Key findings

### WebKitGTK / Tauri differences that needed target-specific work

| Problem found | Response |
| --- | --- |
| The Socket.IO transport stalled repeatedly during startup in WebKitGTK (frames lost between frontend emit and the backend Engine.IO listener). | A raw WebSocket service transport for Tauri. Browser and Electron keep Socket.IO. |
| WebKitGTK's `navigator.clipboard` rejects both read and write. | Clipboard text goes through the native bridge to the GTK clipboard. |
| Native `window.destroy()` does not fire `pagehide`, so the editor layout was not saved on close. | The close path runs Theia's unload hook itself once all vetoes pass. |
| The default webview host `*.webview.127.0.0.1` does not resolve. | Webviews are served on `*.webview.localhost` from the `::1` content server. |
| The mini-browser's generic file endpoint would expose local files if placed on an unauthenticated origin. | Each preview gets a random-host grant scoped to the file's directory, with traversal, dotfile and symlink-escape checks. |
| Notebook renderer/preload imports failed from the isolated iframe origin. | Renderer, static and kernel preloads are mapped to the webview resource route and limited to the contributing extension's directory. |
| Kernel preloads were fixed when the notebook opened, so switching kernels broke output. | The output webview refreshes its roots on kernel change and keeps preloads for kernels used earlier. |
| External file-manager drops never reach the HTML `DataTransfer` path, although the Tauri window gets a native `DragDrop` event. | Native drop bridge: one-time drop ID, validated regular files and directories, symlinks rejected, no overwrite, 30 s expiry. Local workspaces only. |
| On GNOME/X11, focusing a minimized window reported success but the window stayed hidden. | After the Tauri calls, an explicit `_NET_ACTIVE_WINDOW` request is sent through `x11rb`. |
| WebKit downloads landed in the process's working directory. | The host sends downloads to XDG Downloads and adds numeric suffixes when names collide. |
| `native-keymap` never reports layout changes on Linux. | The backend polls the layout descriptor every second and notifies the frontend. |
| A close request sent before the frontend connected was ignored. | The backend close coordinator registers early and holds the request for up to 13 s. |
| `plugin-dev` forked a backend without a token. | A Tauri runner asks the controller for a separate backend and window for the development host. |

### Environment-sensitive failures

- **Exhausted inotify instances hang startup.** With the per-user limit at 128 and all instances in use, `@parcel/watcher` blocked the Node main thread and the backend stopped responding. The Tauri target now uses snapshot polling for the two AI registry watches (local and remote backends). The underlying hazard remains for other native watchers, and it also blocked browser and Electron comparison runs in the same session.
- **Intermittent real-display startup stall:** WebKitGTK withheld `requestAnimationFrame` while the page reported `visible`. Theia now waits at most 500 ms at its two startup animation-frame points.
- **Xvfb needs a window manager.** Without one, `xdotool windowclose` bypasses the native close path. Lifecycle checks need Metacity or similar.
- **Clean machines need the WebKitGTK 4.1, JavaScriptCoreGTK 4.1 and libsoup 3 dev packages.** The test host lacked them and used an extracted sysroot.

### Remote: what the Electron path assumed

- The copied backend started without a native host and failed on the missing token. That led to the separate `remote-main.js` entrypoint plus the gateway.
- Several frontend routes (`/files`, `/file-upload`, `/file`, `/hostedPlugin`, mini-browser) still pointed at the local backend in a remote session. In Tauri they would read host paths. All of them now use the session prefix.
- Native GTK file dialogs can't tell a remote `file:` URI from a local one, so remote sessions use Theia's dialog.
- `RemoteAutoShutdownService` counted only Socket.IO connections and could shut down an active Tauri session after 5 minutes. It now also counts raw WebSocket connections.
- The Docker exec tunnel did not propagate stream closure to the local socket. Fixed.

### Shared fixes that also change Electron/browser

- Startup animation-frame fallback (`FrontendApplication`).
- Save As dialog: the Name field was hidden below the tree at 1280×800 and could collapse to zero height.
- **Rerun Last Task** did not clear the previous run's problem markers.
- A failed manual save (e.g. `EACCES`) was only logged. It now shows a notification, and the editor keeps its unsaved text.
- Notebook renderer errors now show in the output cell instead of a blank result.
- Native-module preparation (`.browser_modules`) is serialized with a lock, so Electron and Tauri rebuilds no longer race.
- The sample API provider and headless main context were fixed so headless plugins start.

## Verified

The checks were focused native runs, mostly under Xvfb with Metacity. "Matched" means the same fixture also passed in Electron.

- **Lifecycle:** multiple independent windows, second-launch forwarding (including concurrent launches), `--open-url` dispatch to the focused window, close veto, and early close. Cleanup after SIGKILL of host, controller or backend, including live PTYs and hosted dev windows. Window bounds/maximized state and the last workspace and editor restore on relaunch (matches Electron, which also restores only one window).
- **Window/menu:** title, minimize/maximize/fullscreen, zoom (persisted), and a native GTK menu with checked and enabled state and command dispatch to the right window.
- **Files:** native open/folder/save dialogs, Save As with overwrite prompt, multi-root, trash, symlink save, read-only and unreadable files (matched), a permission change during a dirty edit (matched), internal Explorer move (matched), and Nautilus file, multi-file, folder and multi-root drops (folder drop matched).
- **OS integration:** `xdg-open`, a real external terminal, text clipboard interop with other X11 apps, plugin secret storage across relaunch, keyboard-layout switch, dead keys, one IBus (Wubi) composition, and exposure of the menu and editor through AT-SPI.
- **Tasks/SCM/debug:** shell tasks, cancellation, foreground and background problem matchers (matched), real `vscode.git` SCM and `js-debug` breakpoints (matched), and a VS Code SCM API probe.
- **Extensions:** webview panel/view/custom editor with reload and relaunch restore, notebooks with renderer, preloads and kernel switch, mini-browser, VSIX install/uninstall, Open VSX install, uninstall and manual version change, native addons in the plugin host (repo-provided and extension-bundled), headless plugins, and hosted plugin start/stop/restart/debug via an external inspector.
- **Remote:** SSH (current window and new window) and Docker attach, plus create from a Dockerfile `devcontainer.json`. Covered editing, terminals, tasks, remote extensions and webviews, icons and decorations, mini-browser preview, upload/download (8 MiB native and via test), port forwarding (SSH and Docker), unexpected backend exit returning to local, repeated reconnects, the unsaved-work veto on disconnect, and surviving past the 5-minute idle timeout. The Electron reference matched for file, terminal and reconnect.
- **Authority, negative probes:** requests without a token get 403. Webview, custom-editor, notebook and mini-browser content cannot open the trusted WebSocket. A mini-browser Origin carrying valid cookies is refused. Top-level navigation to other origins is blocked.
- **Dev loop:** clean build, launch from another directory, switching between browser, Electron and Tauri, Ctrl-C cleanup.

## Known gaps and deviations

- **Security boundary unaudited.** Only the listed negative probes exist. A mini-browser grant covers the whole directory of the previewed file. Do not use the target with untrusted workspaces or extensions.
- **Drops onto specific Explorer rows** produced no native Drop event under Xvfb, so only blank-space drops are reliable. Remote workspaces have no native drop and use **Upload Files...** instead.
- **Native menu has no GTK accelerators**, left off on purpose so shortcuts don't fire twice. Shortcuts shown in the menu are missing.
- **Port selection race:** new-window ports are picked free and retried up to 5 times on `EADDRINUSE`. The first window needs an explicit `--port`, and a collision there fails startup.
- **Remote session reload** logged an uncaught `WebSocket is closed due to suspension` RPC rejection. The workbench kept working. Not investigated.
- A **backend SIGSEGV** happened once while the bundle was rebuilt in place during a remote session. Cause unknown.
- **Built-in Debug Instance** fails with "debug session type node is not supported" because the example has no Node adapter (same in Electron). It works with an external inspector.
- **Debug runtime:** `js-debug` picked the shell's Node 22 in both targets. Set `runtimeExecutable` when a program needs Node 24.
- **Dev loop:** `watch:tauri` does not rebuild Rust. A preparer killed with SIGKILL leaves a stale `.browser_modules.lock` that has to be removed by hand.
- **Clipboard** is text only.

## Still needs testing

**Platform and display**
- Windows, macOS (WKWebView, WebView2) and Wayland: nothing tested.
- Long sessions on a real display, HiDPI/scaling, multiple monitors, theme and contrast.
- Screen-reader navigation and speech, keyboard-only use, other IMEs and languages, and an Electron IME reference.

**Lifecycle and reliability**
- Multi-hour sessions (local and remote), repeated crash and recovery cycles, abrupt exit with an active plugin host.
- Restoring multiple windows and remote sessions (beyond what Electron does today).
- Behavior under resource pressure other than the inotify case.

**Files and OS**
- Remote symlinks and permissions, symlink-escape cases, large or nested folder drops and mixed selections, drag modifiers, other file managers.
- Rich clipboard formats, clipboard persistence after the owning app exits.
- Cancelling transfers from the native UI and transfers under load.

**Extensions**
- Arbitrary third-party extensions, especially ones that rely on Chromium-only web APIs inside webviews.
- Complex notebooks and renderers, remote notebooks.
- A real OAuth provider callback (MCP OAuth adapter registered but unused).
- Automatic or background extension updates. Neither target has a VSX update detector, so this is not a Tauri-specific gap.

**Remote**
- Remote task diagnostics, other `devcontainer.json` options and rebuild, remaining HTTP routes (MCP callback, metrics, external API).
- Duplicate-port and error UI in the Ports view, full Electron remote parity (extensions, preview, tasks).

**Adoption questions not answered by the PoC**
- Measured size, memory and startup against Electron with the new packages.
- Cost of maintaining behavior across three web engines.
- Signing, updater and installers for non-Linux platforms.
