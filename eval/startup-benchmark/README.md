---
title: Tauri vs Electron startup benchmark
project: theia
feature: tauri-int
worktree: null
branch: tauri-int
created: 2026-10-01
tool: claude
---

# Tauri vs Electron startup benchmark

A rough startup comparison of the packaged Linux Tauri and Electron examples. `bench.sh` launches each app several times and reads the timings from the stopwatch lines both targets print to stdout.

## Usage

1. Build and package both examples (see `doc/DesktopPackaging.md`). The script uses the unpacked directories in `dist/desktop/`:

   ```sh
   npm run build:tauri:production && npm run package:tauri -- --dir-only
   npm run build:electron:production && npm run package:electron -- --dir-only
   ```

2. Close every running instance of the packaged examples. A second launch of the packaged Tauri example is forwarded to the running instance (it opens a window there and never logs its own startup), so the script refuses to start while one is running. Dev instances started from `examples/` don't conflict.

3. Run the benchmark from a graphical session (`DISPLAY` set):

   ```sh
   eval/startup-benchmark/bench.sh       # 5 runs per target
   eval/startup-benchmark/bench.sh 10    # 10 runs per target
   ```

   Windows open and close by themselves. Each run takes about 10 s. Don't use the machine heavily while the benchmark is running.

Environment overrides: `DIST` (default `<repo>/dist/desktop`) and `OUT` (default `eval/startup-benchmark/runs`, which is cleared at the start of each run).

## What it does

- Uses one throwaway empty workspace for all runs.
- Does one warm-up launch per target (not counted), then alternates Tauri and Electron so both see the same machine conditions.
- For each launch it polls stdout until `Frontend application startup sequence completed` appears, waits 4 s, then stops only the process tree it launched. A launch that isn't ready within 60 s aborts the benchmark.
- Writes `runs/<target>-<n>.log` (full stdout), `runs/<target>-<n>.wall` and `runs/table.txt`, then prints the table and the means.

| Column | Source |
|---|---|
| `wall_ms` | Launch until the frontend-ready line appears in stdout (includes up to 50 ms polling delay) |
| `be_ready_s` | `Backend application startup sequence completed`, seconds since backend process start |
| `fe_ready_s` | `Frontend application startup sequence completed`, seconds since backend process start |
| `contrib_ms` | `Start frontend contributions` duration |
| `layout_ms` | `Initialize the workbench layout` duration |
| `settled_s` | `All frontend contributions settled`, seconds since frontend page start |

The frontend-ready line comes from `FrontendApplication.start()` through `BackendStopwatch`, which is why it shows up in the backend's stdout for both targets.

## Results 2026-09-30

Linux x64 on X11, packaged production builds from 2026-09-28, one built-in plugin, warm disk cache. A dev Electron instance from `examples/electron` was running in the background during the runs. These runs used the first version of the script (same measurement, but without the running-instance guard or the generated table), so the wall times are taken from its console output. The raw logs are in [`runs/`](runs/).

| target | run | wall_ms | be_ready_s | fe_ready_s | contrib_ms | layout_ms | settled_s |
|---|---|---|---|---|---|---|---|
| tauri | 1 | 5016 | 0.963 | 4.940 | 347.0 | 497.0 | 3.689 |
| tauri | 2 | 5061 | 0.958 | 4.947 | 346.0 | 676.0 | 3.659 |
| tauri | 3 | 4793 | 0.962 | 4.702 | 342.0 | 529.0 | 3.442 |
| tauri | 4 | 4913 | 0.930 | 4.791 | 346.0 | 461.0 | 3.575 |
| tauri | 5 | 4794 | 0.927 | 4.688 | 374.0 | 442.0 | 3.468 |
| electron | 1 | 4355 | 0.899 | 3.985 | 298.7 | 120.8 | 3.078 |
| electron | 2 | 4304 | 0.929 | 3.957 | 302.3 | 85.7 | 3.016 |
| electron | 3 | 4319 | 0.914 | 3.973 | 308.7 | 114.7 | 3.047 |
| electron | 4 | 4345 | 0.923 | 3.953 | 260.5 | 85.0 | 3.021 |
| electron | 5 | 4357 | 0.945 | 3.984 | 264.8 | 125.4 | 3.030 |

| Mean | Tauri | Electron | Δ |
|---|---|---|---|
| Wall clock to frontend ready | 4915 ms | 4336 ms | +579 ms |
| Backend ready | 0.948 s | 0.922 s | ≈ same |
| Frontend ready (since backend start) | 4.814 s | 3.970 s | +0.84 s |
| Start frontend contributions | 351 ms | 287 ms | +64 ms |
| Initialize the workbench layout | 521 ms | 106 ms | about 5× |
| All frontend contributions settled (since page start) | 3.567 s | 3.038 s | +0.53 s |

Findings:

- The backends start in the same time. The gap is entirely on the frontend side.
- The Tauri frontend page starts about 0.3 s later relative to backend start (about 1.25 s vs 0.93 s, derived from `fe_ready_s - settled_s`, which compares two processes' clocks).
- `initializeLayout` is the largest single difference (about 0.4 s). It is consistently 450 to 680 ms in WebKitGTK against 85 to 125 ms in Chromium.

Caveats: small sample on one machine. The Tauri package runs the backend on the Node copied at packaging time, while Electron uses its own Node. Electron is started with `--no-sandbox` on this host (AppArmor user-namespace restriction, see `doc/DesktopPackaging.md`).
