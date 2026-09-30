// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { spawn } from 'node:child_process';
import { chmod, copyFile, cp, lstat, mkdir, mkdtemp, open, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [target, ...flags] = process.argv.slice(2);
if (!['electron', 'tauri'].includes(target) || flags.some(flag => !['--dir-only', '--debug-host'].includes(flag))
    || (target !== 'tauri' && flags.includes('--debug-host'))) {
    throw new Error('Usage: node scripts/package-desktop-linux.mjs <electron|tauri> [--dir-only] [--debug-host]');
}
if (process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch)) {
    throw new Error('Desktop example packaging currently supports Linux x64 and arm64 only');
}

const application = join(repository, 'examples', target);
const metadata = JSON.parse(await readFile(join(application, 'package.json'), 'utf8'));
const packageName = `theia-${target}-example`;
const architecture = process.arch === 'x64' ? 'amd64' : 'arm64';
const output = join(repository, 'dist', 'desktop');
const stageName = `${packageName}-linux-${architecture}`;
const stage = join(output, stageName);
const executable = join(stage, packageName);
const app = target === 'electron' ? join(stage, 'runtime', 'resources', 'app') : join(stage, 'app');
const node = resolve(process.env.THEIA_PACKAGE_NODE || process.execPath);
const native = join(application, 'lib', 'backend', 'native');
const pty = join(application, 'lib', 'prebuilds', `linux-${process.arch}`, 'pty.node');

function run(command, args, options = {}) {
    return new Promise((resolveRun, rejectRun) => {
        const child = spawn(command, args, { stdio: 'inherit', ...options });
        child.once('error', rejectRun);
        child.once('exit', code => code === 0 ? resolveRun() : rejectRun(new Error(`${command} exited with status ${code}`)));
    });
}

async function capture(command, args, environment = process.env) {
    const directory = await mkdtemp(join(tmpdir(), 'theia-desktop-package-'));
    const stdoutPath = join(directory, 'stdout');
    const stderrPath = join(directory, 'stderr');
    const stdout = await open(stdoutPath, 'w');
    const stderr = await open(stderrPath, 'w');
    try {
        const code = await new Promise((resolveCapture, rejectCapture) => {
            const child = spawn(command, args, { env: environment, stdio: ['ignore', stdout.fd, stderr.fd] });
            child.once('error', rejectCapture);
            child.once('close', resolveCapture);
        });
        const output = await readFile(stdoutPath, 'utf8');
        if (code !== 0) {
            throw new Error(`${command} exited with status ${code}: ${await readFile(stderrPath, 'utf8')}`);
        }
        return output;
    } finally {
        await Promise.all([stdout.close(), stderr.close()]);
        await rm(directory, { recursive: true, force: true });
    }
}

async function inspectRuntime(command, environment = process.env) {
    const output = await capture(command, ['-p', 'JSON.stringify({ version: process.versions.node, platform: process.platform, arch: process.arch, abi: process.versions.modules })'], environment);
    return JSON.parse(output);
}

async function verifyNativeModules(runtime, environment = process.env) {
    const files = ['keytar.node', 'keymapping.node', 'watcher.node'].map(name => join(native, name));
    files.push(pty);
    for (const file of files) {
        if (!existsSync(file)) {
            throw new Error(`Missing bundled native module: ${file}. Build the ${target} example first.`);
        }
    }
    try {
        await capture(runtime, ['-e', 'for (const file of process.argv.slice(1)) require(file)', ...files], environment);
    } catch (error) {
        throw new Error(`Bundled native modules do not load in the ${target} runtime. Rebuild the ${target} example.\n${error}`);
    }
}

function launcher() {
    const common = '#!/bin/sh\nset -eu\nself=$(readlink -f "$0")\nroot=$(CDPATH= cd -- "$(dirname -- "$self")" && pwd)\n';
    const project = target === 'electron' ? '"$root/runtime/resources/app"' : '"$root/app"';
    const options = `"--plugins=local-dir:${project.slice(1, -1)}/plugins" "--ovsx-router-config=${project.slice(1, -1)}/ovsx-router-config.json"`;
    if (target === 'electron') {
        // Portable copies cannot ship a root-owned setuid helper, so skip the sandbox where user namespaces are restricted.
        const sandbox = 'sandbox="$root/runtime/chrome-sandbox"\n'
            + 'if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" = 1 ] '
            + '&& ! { [ -u "$sandbox" ] && [ "$(stat -c %u "$sandbox")" = 0 ]; }; then\n'
            + '    echo "theia-electron-example: chrome-sandbox is not setuid root and user namespaces are restricted; starting with --no-sandbox" >&2\n'
            + '    set -- --no-sandbox "$@"\n'
            + 'fi\n';
        return `${common}${sandbox}exec "$root/runtime/electron" ${options} "$@"\n`;
    }
    return `${common}exec "$root/bin/theia-tauri-host" "$root/app/lib/backend/tauri-main.js" "$root/bin/node" ${options} "$@"\n`;
}

async function requireFile(file, description) {
    if (!existsSync(file)) {
        throw new Error(`Missing ${description}: ${file}. Build the ${target} example first.`);
    }
}

async function normalizePermissions(file) {
    const info = await lstat(file);
    if (info.isSymbolicLink()) {
        return;
    }
    if (info.isDirectory()) {
        await chmod(file, 0o755);
        for (const name of await readdir(file)) {
            await normalizePermissions(join(file, name));
        }
    } else if (info.isFile()) {
        await chmod(file, info.mode & 0o111 ? 0o755 : 0o644);
    }
}

await requireFile(join(application, 'lib', 'backend', target === 'electron' ? 'electron-main.js' : 'tauri-main.js'), 'desktop entrypoint');
await requireFile(join(application, 'lib', 'frontend', 'index.html'), 'frontend bundle');
await requireFile(pty, 'native PTY module');

if (target === 'tauri') {
    const runtime = await inspectRuntime(node);
    if (runtime.platform !== 'linux' || runtime.arch !== process.arch || Number(runtime.version.split('.')[0]) < 24) {
        throw new Error(`Tauri packaging needs a Linux ${process.arch} Node 24+ executable; got ${JSON.stringify(runtime)}`);
    }
    await verifyNativeModules(node);
    const host = join(repository, 'packages', 'tauri', 'src-tauri', 'target',
        flags.includes('--debug-host') ? 'debug' : 'release', 'theia-tauri-host');
    await requireFile(host, 'Rust host');
} else {
    const electron = join(repository, 'node_modules', 'electron', 'dist', 'electron');
    await requireFile(electron, 'Electron runtime');
    const environment = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    const runtime = await inspectRuntime(electron, environment);
    if (runtime.platform !== 'linux' || runtime.arch !== process.arch) {
        throw new Error(`Electron runtime does not match Linux ${process.arch}: ${JSON.stringify(runtime)}`);
    }
    await verifyNativeModules(electron, environment);
}

await rm(stage, { recursive: true, force: true });
await mkdir(app, { recursive: true });
await cp(join(application, 'lib'), join(app, 'lib'), {
    recursive: true,
    filter: source => !source.endsWith('.map') && !source.endsWith('.map.gz')
});
await copyFile(join(application, 'package.json'), join(app, 'package.json'));
await copyFile(join(repository, 'examples', 'ovsx-router-config.json'), join(app, 'ovsx-router-config.json'));
if (existsSync(join(application, 'resources'))) {
    await cp(join(application, 'resources'), join(app, 'resources'), { recursive: true });
}
const plugins = join(repository, 'plugins');
if (existsSync(plugins)) {
    await cp(plugins, join(app, 'plugins'), { recursive: true });
} else {
    await mkdir(join(app, 'plugins'));
}
await mkdir(join(stage, 'licenses'));
for (const name of ['LICENSE-EPL', 'LICENSE-GPL-2.0-ONLY-CLASSPATH-EXCEPTION', 'LICENSE-MIT.txt', 'LICENSE-vscode.txt']) {
    await copyFile(join(repository, name), join(stage, 'licenses', name));
}

if (target === 'electron') {
    await cp(join(repository, 'node_modules', 'electron', 'dist'), join(stage, 'runtime'), { recursive: true });
} else {
    await mkdir(join(stage, 'bin'));
    const host = join(repository, 'packages', 'tauri', 'src-tauri', 'target',
        flags.includes('--debug-host') ? 'debug' : 'release', 'theia-tauri-host');
    await copyFile(host, join(stage, 'bin', 'theia-tauri-host'));
    await copyFile(node, join(stage, 'bin', 'node'));
    await chmod(join(stage, 'bin', 'theia-tauri-host'), 0o755);
    await chmod(join(stage, 'bin', 'node'), 0o755);
    if (!flags.includes('--debug-host')) {
        await run('strip', ['--strip-debug', join(stage, 'bin', 'theia-tauri-host')]);
    }
    const nodeLicense = join(dirname(node), '..', 'LICENSE');
    const systemNodeLicense = '/usr/share/doc/nodejs/copyright';
    const license = existsSync(nodeLicense) ? nodeLicense : systemNodeLicense;
    if (!existsSync(license)) {
        throw new Error(`Cannot find the Node.js license for ${node}`);
    }
    await copyFile(license, join(stage, 'licenses', 'LICENSE-Node.js'));
}
await writeFile(executable, launcher(), { mode: 0o755 });
await chmod(executable, 0o755);
await normalizePermissions(stage);
console.log(`Staged ${target} at ${stage}`);

if (!flags.includes('--dir-only')) {
    const archive = join(output, `${stageName}-${metadata.version}.tar.gz`);
    await run('tar', ['-czf', archive, '-C', output, stageName]);
    if (!existsSync(archive)) {
        throw new Error(`tar did not create ${archive}`);
    }
    await chmod(archive, 0o644);

    const debRoot = join(output, `.${packageName}-deb-root`);
    await rm(debRoot, { recursive: true, force: true });
    try {
        const installed = join(debRoot, 'opt', packageName);
        await mkdir(dirname(installed), { recursive: true });
        await cp(stage, installed, { recursive: true });
        const userBin = join(debRoot, 'usr', 'bin');
        await mkdir(userBin, { recursive: true });
        await symlink(join('/opt', packageName, packageName), join(userBin, packageName));
        const desktop = join(debRoot, 'usr', 'share', 'applications');
        await mkdir(desktop, { recursive: true });
        await writeFile(join(desktop, `${packageName}.desktop`),
            `[Desktop Entry]\nType=Application\nName=${metadata.productName}\nExec=${packageName} %F\nIcon=${packageName}\nTerminal=false\nCategories=Development;IDE;\n`);
        const icons = join(debRoot, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps');
        await mkdir(icons, { recursive: true });
        await copyFile(join(repository, 'packages', 'tauri', 'src-tauri', 'icons', 'icon.png'), join(icons, `${packageName}.png`));
        const control = join(debRoot, 'DEBIAN');
        await mkdir(control);
        const dependencies = target === 'tauri'
            ? 'libwebkit2gtk-4.1-0, libgtk-3-0, libsecret-1-0, xdg-utils'
            : 'libgtk-3-0, libnss3, libxss1, libxtst6, libsecret-1-0, libasound2t64 | libasound2, xdg-utils';
        await writeFile(join(control, 'control'),
            `Package: ${packageName}\nVersion: ${metadata.version}\nSection: devel\nPriority: optional\nArchitecture: ${architecture}\nMaintainer: Eclipse Theia contributors <theia-dev@eclipse.org>\nDepends: ${dependencies}\nDescription: Experimental ${target} desktop example for Eclipse Theia\n Source-built Linux example of the Eclipse Theia desktop workbench.\n`);
        await normalizePermissions(debRoot);
        if (target === 'electron') {
            await chmod(join(installed, 'runtime', 'chrome-sandbox'), 0o4755);
        }
        const deb = join(output, `${packageName}_${metadata.version}_${architecture}.deb`);
        await run('dpkg-deb', ['--root-owner-group', '--build', debRoot, deb]);
        if (!existsSync(deb)) {
            throw new Error(`dpkg-deb did not create ${deb}`);
        }
        await chmod(deb, 0o644);
        console.log(`Created ${archive}\nCreated ${deb}`);
    } finally {
        await rm(debRoot, { recursive: true, force: true });
    }
}
