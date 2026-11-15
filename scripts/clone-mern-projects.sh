#!/usr/bin/env bash
# Clone EVERY repository from https://github.com/topics/mern-project
# (catalogue: docs/mern-projects/projects.json) into ./mern-projects/
#
# - Shallow clones (--depth 1): full history of 2,000+ repos is many TB.
# - Resumable: repos already cloned are skipped, so re-running continues
#   where a previous run stopped.
# - Parallel: JOBS concurrent clones (default 8).
# - Clones land in mern-projects/, which is .gitignore'd — 2,000+ third-party
#   repos (each with its own licence/history) must NOT be committed into
#   this repository. Run this on a machine with plenty of free disk
#   (expect tens to hundreds of GB even shallow).
#
# Usage:
#   bash scripts/clone-mern-projects.sh            # clone all
#   JOBS=16 bash scripts/clone-mern-projects.sh    # more parallelism
#   LIMIT=20 bash scripts/clone-mern-projects.sh   # only the first N (smoke test)
set -u
cd "$(dirname "$0")/.."

CATALOG="docs/mern-projects/projects.json"
DEST="mern-projects"
JOBS="${JOBS:-8}"
LIMIT="${LIMIT:-0}"

[ -f "$CATALOG" ] || { echo "Missing $CATALOG — run: node scripts/fetch-mern-projects.mjs"; exit 1; }
mkdir -p "$DEST"

node -e '
  const fs = require("fs");
  let repos = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const limit = Number(process.argv[2]);
  if (limit > 0) repos = repos.slice(0, limit);
  for (const r of repos) console.log(`${r.clone_url}\t${r.full_name}`);
' "$CATALOG" "$LIMIT" > "$DEST/.clone-list.tsv"

total=$(wc -l < "$DEST/.clone-list.tsv")
echo "Cloning $total repos from topic:mern-project into $DEST/ (JOBS=$JOBS) …"

clone_one() {
  url="$1"; name="$2"; dest="$3"
  dir="$dest/$name"
  if [ -d "$dir/.git" ]; then echo "skip  $name"; return 0; fi
  mkdir -p "$(dirname "$dir")"
  if git clone --depth 1 --quiet "$url" "$dir" 2>"$dir.clone.log"; then
    rm -f "$dir.clone.log"; echo "ok    $name"
  else
    echo "FAIL  $name (see $dir.clone.log)"; rm -rf "$dir"
  fi
}
export -f clone_one 2>/dev/null || true

if command -v xargs >/dev/null && xargs --help 2>&1 | grep -q '\-P'; then
  # TSV -> two args per line via a small reader (portable enough for GNU xargs)
  while IFS=$'\t' read -r url name; do printf '%s\0%s\0' "$url" "$name"; done < "$DEST/.clone-list.tsv" \
    | xargs -0 -n2 -P "$JOBS" bash -c 'clone_one "$1" "$2" "$0"' "$DEST"
else
  while IFS=$'\t' read -r url name; do clone_one "$url" "$name" "$DEST"; done < "$DEST/.clone-list.tsv"
fi

done_count=$(find "$DEST" -maxdepth 3 -name .git -type d | wc -l)
echo "Done. $done_count repos present under $DEST/ (of $total listed). Re-run to resume/retry failures."
