# Packaging the Linux desktop examples

The Electron and experimental Tauri examples can be built into portable archives and Debian packages from this checkout. This packaging is for Linux x64 and arm64 evaluation. It is separate from the [Theia IDE product repository](https://github.com/eclipse-theia/theia-ide), which uses [electron-builder](https://github.com/eclipse-theia/theia-ide/blob/master/applications/electron/electron-builder.yml) for its Electron releases. These example packages do not inherit Theia IDE branding, signing, update feeds, or release support.

## Build and package

Use Node.js 24 or newer for the repository build. Build one target and package it before switching to the other, because the native-module preparation cache is shared.

```sh
npm install
npm run compile
npm run build:tauri:production
npm run package:tauri
npm run build:electron:production
npm run package:electron
```

The Tauri build also needs Rust and the [Tauri Linux development prerequisites](https://v2.tauri.app/start/prerequisites/#linux). The Electron build needs its downloaded Electron runtime. `package:tauri` copies the release Rust host and the Node executable used by the package command. Set `THEIA_PACKAGE_NODE=/absolute/path/to/node` to select a different Node 24+ executable; it must match the architecture and native modules built for the Tauri example. Both packaging commands check that their bundled native modules load in the selected runtime before staging the package.

Each command writes three outputs under `dist/desktop/`:

- An unpacked `theia-<target>-example-linux-<architecture>/` directory. Run its `theia-<target>-example` launcher directly.
- A portable `.tar.gz` containing that directory. Extract it anywhere and run the launcher inside it.
- A `.deb` installing the launcher in `/usr/bin`, the application in `/opt/theia-<target>-example`, and a desktop entry and icon.

To stage only the unpacked directory while iterating, run `npm run package:tauri -- --dir-only` or `npm run package:electron -- --dir-only`. For a development-host smoke check, `npm run package:tauri -- --dir-only --debug-host` accepts the debug Rust binary; release packages use the release host by default. Package commands consume the current compiled example bundles; build the appropriate target first.

Pass a workspace or other Theia command-line arguments to the installed launcher, for example:

```sh
theia-tauri-example /path/to/workspace
theia-electron-example /path/to/workspace
```

The launchers point to the packaged plugin directory and Open VSX router configuration. If the repository's `plugins/` directory exists when packaging runs, its contents are included; otherwise the package has an empty plugin directory. Production source maps are omitted from both outputs. The Tauri package includes a Node runtime, its native addons, the Rust host and frontend/backend assets. The Rust host embeds only a small fallback page: it loads the workbench through the local backend and does not need a second copy of the frontend in the executable. Tauri depends on the system WebKitGTK runtime. The Electron package includes Electron's Chromium/Node runtime, its native addons and the same example assets. This mirrors the Theia IDE product's principle of packaging a bundled backend and plugins, while keeping the two examples comparable and avoiding an additional packager dependency in this repository.

## Current limits

- These are unsigned Linux example packages. Theia IDE's AppImage target is not provided here; installer formats, signing and updates for Windows and macOS are not implemented.
- The Tauri target remains experimental. The [example README](../examples/tauri/README.md) records tested workflows and known gaps; packaging does not establish production parity or a security boundary for arbitrary untrusted content.
- The `.deb` declares the main desktop runtime dependencies. Other runtime tools used by optional workflows, such as Docker, OpenSSH, `tar`, `xz`, or `xdg-open`, still need to be present where those workflows run.
- The archives and packages preserve the prebuilt native ABI for the runtime used during packaging. Build and package on each target architecture and a compatible Linux distribution; cross-building and older glibc baselines have not been tested.
- The Debian Electron package installs `chrome-sandbox` with root ownership and its required setuid mode. Portable archives rely on the host's user-namespace sandbox. Where AppArmor restricts unprivileged user namespaces (the Ubuntu 23.10+ default) and `chrome-sandbox` is not setuid root, the launcher starts Electron with `--no-sandbox` and prints a warning. Install the `.deb` to keep the Chromium sandbox on such hosts.
- Review bundled third-party notices and the product's distribution obligations before redistributing these example outputs.
- No updater, install/upgrade test matrix, or long-duration packaged-app test is included yet.
