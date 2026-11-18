#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

INSTALL_DIR="${ALOAPI_INSTALL_DIR:-}"
RUN_NPM_INSTALL=1

usage() {
  cat <<'EOF'
ALOAPI CLI Installer

Usage:
  ./scripts/install.sh [options]

Options:
  --prefix <dir>      Install the `aloapi` executable into <dir>
  --no-npm-install    Skip running `npm ci` when dependencies are missing
  -h, --help          Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix)
      if [[ $# -lt 2 ]]; then
        echo "Error: --prefix requires a directory argument." >&2
        exit 2
      fi
      INSTALL_DIR="$2"
      shift 2
      ;;
    --prefix=*)
      INSTALL_DIR="${1#--prefix=}"
      shift
      ;;
    --no-npm-install)
      RUN_NPM_INSTALL=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$REPO_ROOT/package.json" || ! -f "$REPO_ROOT/scripts/aloapi.mjs" || ! -f "$REPO_ROOT/prisma/schema.prisma" ]]; then
  echo "Error: $REPO_ROOT does not look like a complete ALOAPI repository." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>= 22.5.0) is required but was not found in PATH." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but was not found in PATH." >&2
  exit 1
fi

NODE_OK="$(node -e 'const [maj, min] = process.versions.node.split(".").map(Number); process.stdout.write((maj > 22 || (maj === 22 && min >= 5)) ? "1" : "0");')"
if [[ "$NODE_OK" != "1" ]]; then
  echo "Error: Node.js >= 22.5.0 is required (found $(node -v))." >&2
  exit 1
fi

chmod +x "$REPO_ROOT/scripts/aloapi.mjs" "$REPO_ROOT/scripts/install.sh"

if [[ "$RUN_NPM_INSTALL" -eq 1 && ! -d "$REPO_ROOT/node_modules/next" ]]; then
  echo "Installing Node.js dependencies via npm ci..."
  (cd "$REPO_ROOT" && npm ci)
fi

STATE_DIR="${ALOAPI_STATE_DIR:-$HOME/.aloapi}"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR" 2>/dev/null || true
printf '%s\n' "$REPO_ROOT" > "$STATE_DIR/project-root"
chmod 600 "$STATE_DIR/project-root" 2>/dev/null || true

path_contains() {
  case ":$PATH:" in
    *":$1:"*) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ -z "$INSTALL_DIR" ]]; then
  NPM_BIN=""
  if NPM_PREFIX="$(npm prefix -g 2>/dev/null)"; then
    NPM_BIN="$NPM_PREFIX/bin"
  fi

  if [[ -n "$NPM_BIN" && -d "$NPM_BIN" && -w "$NPM_BIN" ]] && path_contains "$NPM_BIN"; then
    INSTALL_DIR="$NPM_BIN"
  elif [[ -d "/usr/local/bin" && -w "/usr/local/bin" ]] && path_contains "/usr/local/bin"; then
    INSTALL_DIR="/usr/local/bin"
  elif [[ -d "/opt/homebrew/bin" && -w "/opt/homebrew/bin" ]] && path_contains "/opt/homebrew/bin"; then
    INSTALL_DIR="/opt/homebrew/bin"
  else
    INSTALL_DIR="$HOME/.local/bin"
  fi
fi

mkdir -p "$INSTALL_DIR"
TARGET_BIN="$INSTALL_DIR/aloapi"
EXPECTED_TARGET="$REPO_ROOT/scripts/aloapi.mjs"

# Never delete or overwrite an unrelated executable at the chosen install path.
if [[ -L "$TARGET_BIN" ]]; then
  EXISTING_TARGET="$(readlink "$TARGET_BIN")"
  if [[ "$EXISTING_TARGET" != "$EXPECTED_TARGET" ]]; then
    echo "Error: $TARGET_BIN is an existing symlink not owned by this ALOAPI installation ($EXISTING_TARGET)." >&2
    echo "Choose another directory with --prefix <dir>, or move that file yourself." >&2
    exit 1
  fi
  rm -- "$TARGET_BIN"
elif [[ -e "$TARGET_BIN" ]]; then
  if [[ -f "$TARGET_BIN" ]] && grep -Fq '# ALOAPI CLI managed launcher' "$TARGET_BIN"; then
    rm -- "$TARGET_BIN"
  else
    echo "Error: $TARGET_BIN already exists and is not an ALOAPI-managed launcher." >&2
    echo "Choose another directory with --prefix <dir>, or move that file yourself." >&2
    exit 1
  fi
fi

if ln -s "$EXPECTED_TARGET" "$TARGET_BIN" 2>/dev/null; then
  :
else
  cat > "$TARGET_BIN" <<EOF
#!/usr/bin/env sh
# ALOAPI CLI managed launcher
exec node "$EXPECTED_TARGET" "\$@"
EOF
  chmod 755 "$TARGET_BIN"
fi

PATH_UPDATED=""
if ! path_contains "$INSTALL_DIR"; then
  if [[ "$INSTALL_DIR" == "$HOME/.local/bin" && -z "${ALOAPI_SKIP_SHELL_RC:-}" ]]; then
    PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
    for rc_file in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
      if [[ -f "$rc_file" ]]; then
        if ! grep -Fq '.local/bin' "$rc_file"; then
          printf '\n# Added by ALOAPI CLI installer\n%s\n' "$PATH_LINE" >> "$rc_file"
          PATH_UPDATED="$rc_file"
        fi
      fi
    done
    if [[ -z "$PATH_UPDATED" && ! -f "$HOME/.bashrc" && ! -f "$HOME/.zshrc" ]]; then
      printf '\n# Added by ALOAPI CLI installer\n%s\n' "$PATH_LINE" >> "$HOME/.profile"
      PATH_UPDATED="$HOME/.profile"
    fi
  fi
fi

echo "ALOAPI CLI installed successfully."
echo "  Executable:   $TARGET_BIN"
echo "  Project root: $REPO_ROOT"
echo "  Dashboard:    http://localhost:47831"
PACKAGE_VERSION="$(node -e 'const fs = require("node:fs"); const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(pkg.version || "0.0.0");' "$REPO_ROOT/package.json")"
echo "  ALOAPI v$PACKAGE_VERSION"

if ! path_contains "$INSTALL_DIR"; then
  echo ""
  echo "Note: $INSTALL_DIR is not currently in your active shell PATH."
  if [[ -n "$PATH_UPDATED" ]]; then
    echo "Updated $PATH_UPDATED. Reload your shell or run:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
  else
    echo "Add it to your PATH:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
  fi
else
  echo ""
  echo 'Run `aloapi` from any directory to start ALOAPI and open http://localhost:47831.'
fi
