#!/bin/bash
# Zieht das Ambient-Debug von der Headunit (ENET, Zündung an). Schreibt nach captures/.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
source "$HERE/../../setup/lib.sh"

out=$(run_status)
ip=$(mgu_ip "$out" || true)
if [[ -z "$ip" ]]; then
    echo "Keine Headunit-Adresse. ENET-Kabel und Zündung?" >&2
    exit 1
fi

dest="$HERE/../captures/$(date +%Y-%m-%d-%H%M)"
mkdir -p "$dest"
echo "Headunit $ip → $dest"

ssh_hu "$ip" 'sh -s' << 'EOF' | tar -xzf - -C "$dest"
set -e
data=
for d in /var/opt/public/oap/oap_*/data; do
    if [ -f "$d/gs_ambient_comfort.log" ] || [ -f "$d/gs_ambient_state.json" ]; then
        data=$d
        break
    fi
done
tmp=/tmp/gs-ambient-pull
rm -rf "$tmp"
mkdir -p "$tmp"
{
    echo "uptime: $(uptime)"
    echo "data: ${data:-keine}"
    echo "--- prozesse ---"
    ps w | grep -E 'comfort_keep|gs_ambient|node' | grep -v grep || true
} > "$tmp/snapshot.txt"
if [ -n "$data" ]; then
    for f in gs_ambient_comfort.log gs_ambient_comfort.json gs_ambient_probe.json \
             gs_ambient_debug.log gs_ambient_debug.log.1 gs_ambient_state.json \
             gs_ambient_light.json gs_ambient.log gs_ambient.log.1; do
        [ -f "$data/$f" ] && cp "$data/$f" "$tmp/$f"
    done
fi
tar -czf - -C "$tmp" .
rm -rf "$tmp"
EOF

echo "Liegt in $dest"
ls -1 "$dest"
