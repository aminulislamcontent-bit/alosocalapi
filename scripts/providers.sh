#!/usr/bin/env bash
# Manage the AI Automation Server Provider Stack (providers/ — pinned git submodules).
#
#   bash scripts/providers.sh init     # fetch all 7 providers (shallow; obs-studio recursively)
#   bash scripts/providers.sh status   # what's cloned, pinned commit, size
#   bash scripts/providers.sh update   # move pins to latest upstream HEAD (review + commit the diff!)
#   bash scripts/providers.sh doctor   # check env vars the stack expects
set -u
cd "$(dirname "$0")/.."

case "${1:-status}" in
  init)
    # obs-studio has 3 nested submodules of its own, hence --recursive for that one.
    git submodule update --init --depth 1 providers/ybt-army-135m providers/agency-orchestrator \
      providers/ai-agency-agents providers/agency-agents providers/agency-agents-zh providers/nginx
    git submodule update --init --recursive --depth 1 providers/obs-studio
    ;;
  status)
    git submodule status providers/
    echo
    du -sh providers/*/ 2>/dev/null
    ;;
  update)
    git submodule update --remote --depth 1 providers/
    echo "Pins moved. Review 'git diff .gitmodules providers/' and commit intentionally."
    ;;
  doctor)
    # shellcheck disable=SC1091
    [ -f .env ] && set -a && . ./.env && set +a
    for v in AUTOMATION_ORCHESTRATOR_URL YBT_ARMY_URL OBS_WEBSOCKET_URL OBS_WEBSOCKET_PASSWORD; do
      if [ -n "${!v:-}" ]; then echo "set    $v"; else echo "unset  $v  (optional — only needed when that provider runs)"; fi
    done
    node -e 'const p=require("./providers/providers.json").providers; console.log(`\n${p.length} providers in manifest:`); for (const x of p) console.log(` - ${x.key.padEnd(22)} ${x.role.padEnd(24)} ${x.license}`)'
    ;;
  *) echo "usage: $0 {init|status|update|doctor}"; exit 1 ;;
esac
