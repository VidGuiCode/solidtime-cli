#!/usr/bin/env bash
# Post-pack verification: install the .tgz into a temp directory and smoke test it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=== Packing ==="
TARBALL=$(npm pack 2>/dev/null | tail -1)
echo "  Packed: $TARBALL"

# Create a temp directory and clean it up on exit
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR" "$PROJECT_DIR/$TARBALL"' EXIT

echo ""
echo "=== Installing into temp directory ==="
cd "$TMPDIR"
npm init -y > /dev/null 2>&1
npm install "$PROJECT_DIR/$TARBALL" > /dev/null 2>&1
echo "  Installed successfully"

SOLIDTIME="$TMPDIR/node_modules/.bin/solidtime"

echo ""
echo "=== Smoke tests ==="

VERSION=$("$SOLIDTIME" --version 2>&1)
echo "  version: $VERSION"

HELP=$("$SOLIDTIME" --help 2>&1)
echo "$HELP" | grep -q "Commands" && echo "  help: OK" || { echo "  help: FAIL"; exit 1; }

for cmd in project time-entry task tag member where account organization discover profile upgrade completion; do
  echo "$HELP" | grep -q "$cmd" && echo "  $cmd: OK" || { echo "  $cmd: FAIL"; exit 1; }
done

TE_HELP=$("$SOLIDTIME" time-entry --help 2>&1)
for sub in list start stop create update delete; do
  echo "$TE_HELP" | grep -q "$sub" && echo "  time-entry $sub: OK" || { echo "  time-entry $sub: FAIL"; exit 1; }
done

DISC_HELP=$("$SOLIDTIME" discover --help 2>&1)
for sub in context projects tasks tags members; do
  echo "$DISC_HELP" | grep -q "$sub" && echo "  discover $sub: OK" || { echo "  discover $sub: FAIL"; exit 1; }
done

ACCT_HELP=$("$SOLIDTIME" account --help 2>&1)
for sub in list use remove show; do
  echo "$ACCT_HELP" | grep -q "$sub" && echo "  account $sub: OK" || { echo "  account $sub: FAIL"; exit 1; }
done

echo ""
echo "All smoke tests passed."
