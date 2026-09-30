#!/bin/bash
# Rough startup comparison of the packaged Tauri and Electron examples, based on the stopwatch log lines.
# Usage: bench.sh [runs] (default 5)
set -u
RUNS=${1:-5}
HERE=$(cd -- "$(dirname -- "$0")" && pwd)
DIST=${DIST:-$(cd -- "$HERE/../.." && pwd)/dist/desktop}
OUT=${OUT:-$HERE/runs}
WS=$(mktemp -d /tmp/theia-startup-bench-ws.XXXXXX)
READY='Frontend application startup sequence completed'
declare -A LAUNCH=(
    [tauri]=$DIST/theia-tauri-example-linux-amd64/theia-tauri-example
    [electron]=$DIST/theia-electron-example-linux-amd64/theia-electron-example
)
for t in tauri electron; do
    [ -x "${LAUNCH[$t]}" ] || { echo "missing ${LAUNCH[$t]}, run npm run package:$t first" >&2; exit 1; }
done
# A second launch is forwarded to a running instance and would never log its own startup.
if pgrep -f "^$DIST/theia-(tauri|electron)-example-linux-amd64/" > /dev/null; then
    echo "a packaged example from $DIST is already running, close it first:" >&2
    pgrep -af "^$DIST/theia-(tauri|electron)-example-linux-amd64/" | cut -c1-160 >&2
    exit 1
fi
rm -rf "$OUT"; mkdir -p "$OUT"

descendants() {
    local c
    for c in $(pgrep -P "$1"); do echo "$c"; descendants "$c"; done
}

# Only stops the launched process tree, so other running Theia instances are left alone.
stop_tree() {
    local pids="$1 $(descendants "$1")"
    kill $pids 2>/dev/null
    for _ in $(seq 1 100); do kill -0 $pids 2>/dev/null || return 0; sleep 0.1; done
    kill -9 $pids 2>/dev/null
}

run() { # target label
    local t=$1 log=$OUT/$1-$2.log
    local start=$(date +%s%N)
    # The launchers exec the host binary, so $! is the app's main process.
    "${LAUNCH[$t]}" "$WS" > "$log" 2>&1 &
    local pid=$!
    for _ in $(seq 1 1200); do grep -q "$READY" "$log" && break; sleep 0.05; done
    local wall=$(( ($(date +%s%N) - start) / 1000000 ))
    if ! grep -q "$READY" "$log"; then
        stop_tree "$pid" 2>/dev/null
        echo "$t $2 did not report startup within 60 s, see $log" >&2
        exit 1
    fi
    echo "$wall" > "$OUT/$1-$2.wall"
    sleep 4
    stop_tree "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
    sleep 2
    echo "$t $2 wall=${wall}ms"
}

# field <log> <line pattern> <capture regex>
field() { local v=$(grep -m1 "$2" "$1" | sed -E "s/.*$3.*/\1/"); echo "${v:--}"; }

run tauri warmup
run electron warmup
for n in $(seq 1 "$RUNS"); do run tauri "$n"; run electron "$n"; done
rm -rf "$WS"

echo
printf '%-9s %-4s %8s %9s %9s %11s %10s %11s\n' target run wall_ms be_ready_s fe_ready_s contrib_ms layout_ms settled_s
for t in tauri electron; do
    for n in $(seq 1 "$RUNS"); do
        f=$OUT/$t-$n.log
        printf '%-9s %-4s %8s %9s %9s %11s %10s %11s\n' "$t" "$n" "$(cat "$OUT/$t-$n.wall")" \
            "$(field "$f" 'Backend application startup sequence completed' '\[([0-9.]+) s since backend')" \
            "$(field "$f" "$READY" '\[([0-9.]+) s since backend')" \
            "$(field "$f" 'Start frontend contributions:' ': ([0-9.]+) ms')" \
            "$(field "$f" 'Initialize the workbench layout:' ': ([0-9.]+) ms')" \
            "$(field "$f" 'All frontend contributions settled' '\[([0-9.]+) s since frontend page')"
    done
done | tee "$OUT/table.txt" | awk '
    { print; seen[$1] = 1; for (i = 3; i <= 8; i++) { if ($i != "-") { sum[$1, i] += $i; n[$1, i]++ } } }
    END {
        for (t in seen) {
            for (i = 3; i <= 8; i++) { m[i] = n[t, i] ? sum[t, i] / n[t, i] : 0 }
            printf "%-9s %-4s %8.0f %9.3f %9.3f %11.1f %10.1f %11.3f\n", t, "mean", m[3], m[4], m[5], m[6], m[7], m[8]
        }
    }'
