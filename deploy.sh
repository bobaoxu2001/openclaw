#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# OpenClaw Native Deployment Script
# Builds from source and runs directly with Node.js
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

OPENCLAW_INSTALL_DIR="${OPENCLAW_INSTALL_DIR:-/opt/openclaw}"
PID_FILE="/tmp/openclaw-gateway.pid"
LOG_FILE="/tmp/openclaw-gateway.log"

# --- Pre-flight checks ---
check_dependencies() {
    log_info "Checking dependencies..."
    local missing=()

    if ! command -v node &>/dev/null; then
        missing+=("node (v22+)")
    fi

    if ! command -v pnpm &>/dev/null; then
        missing+=("pnpm")
    fi

    if ! command -v git &>/dev/null; then
        missing+=("git")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing[*]}"
        exit 1
    fi

    # Check Node version >= 22
    local node_major
    node_major=$(node -v | sed 's/v\([0-9]*\).*/\1/')
    if [ "$node_major" -lt 22 ]; then
        log_error "Node.js v22+ required (found v${node_major})"
        exit 1
    fi

    log_ok "All dependencies found (Node $(node -v), pnpm $(pnpm -v))"
}

# --- Environment setup ---
setup_env() {
    if [ ! -f .env ]; then
        log_info "Creating .env from .env.example..."
        cp .env.example .env
        log_ok ".env file created."
    else
        log_info ".env file already exists, keeping current values."
    fi

    # Source the env file
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a

    # Generate gateway token if not set
    if [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
        log_info "Generating gateway token..."
        OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')
        if grep -q "^OPENCLAW_GATEWAY_TOKEN=" .env; then
            sed -i "s/^OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}/" .env
        else
            echo "OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}" >> .env
        fi
        log_ok "Gateway token generated and saved to .env"
    fi
}

# --- Install Bun if needed ---
install_bun() {
    if command -v bun &>/dev/null; then
        log_ok "Bun already installed ($(bun --version))"
        return
    fi
    log_info "Installing Bun (required for build)..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    log_ok "Bun installed ($(bun --version))"
}

# --- Clone or update source ---
clone_source() {
    local version="${OPENCLAW_VERSION:-main}"
    if [ -d "$OPENCLAW_INSTALL_DIR/.git" ]; then
        log_info "Updating OpenClaw source (branch: $version)..."
        cd "$OPENCLAW_INSTALL_DIR"
        git fetch origin "$version" --depth 1
        git checkout FETCH_HEAD
        cd "$SCRIPT_DIR"
    else
        log_info "Cloning OpenClaw source (branch: $version)..."
        git clone --depth 1 --branch "$version" https://github.com/openclaw/openclaw.git "$OPENCLAW_INSTALL_DIR"
    fi
    log_ok "Source ready at $OPENCLAW_INSTALL_DIR"
}

# --- Install dependencies and build ---
build_project() {
    cd "$OPENCLAW_INSTALL_DIR"
    export PATH="$HOME/.bun/bin:$PATH"
    export OPENCLAW_PREFER_PNPM=1

    log_info "Installing dependencies..."
    NODE_OPTIONS=--max-old-space-size=2048 pnpm install --frozen-lockfile
    log_ok "Dependencies installed."

    log_info "Building OpenClaw..."
    pnpm build
    pnpm ui:build
    log_ok "Build complete."

    cd "$SCRIPT_DIR"
}

# --- Setup OpenClaw config ---
setup_config() {
    local config_dir="${HOME}/.openclaw"
    local config_file="${config_dir}/openclaw.json"

    mkdir -p "${config_dir}/workspace"

    if [ ! -f "$config_file" ]; then
        log_info "Creating OpenClaw configuration..."
        cat > "$config_file" << 'CONFIGEOF'
{
  "gateway": {
    "controlUi": {
      "dangerouslyAllowHostHeaderOriginFallback": true
    }
  }
}
CONFIGEOF
        log_ok "Configuration created at $config_file"
    else
        log_info "Configuration already exists at $config_file"
    fi

    # Add MiniMax provider config if MINIMAX_API_KEY is set
    if [ -n "${MINIMAX_API_KEY:-}" ]; then
        log_info "Configuring MiniMax model provider..."
        cat > "$config_file" << 'CONFIGEOF'
{
  "gateway": {
    "controlUi": {
      "dangerouslyAllowHostHeaderOriginFallback": true
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "minimax/MiniMax-M2.5"
      }
    }
  },
  "models": {
    "providers": {
      "minimax": {
        "baseUrl": "https://api.minimax.ai/v1",
        "apiKey": "${MINIMAX_API_KEY}",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "MiniMax-M2.5",
            "name": "MiniMax M2.5",
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
CONFIGEOF
        log_ok "MiniMax M2.5 configured as default model"
    fi
}

# --- Start gateway ---
start_gateway() {
    # Stop existing instance
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        log_info "Stopping existing gateway (PID $(cat "$PID_FILE"))..."
        kill "$(cat "$PID_FILE")" 2>/dev/null || true
        sleep 2
    fi

    local port="${OPENCLAW_GATEWAY_PORT:-18789}"
    local bind="${OPENCLAW_GATEWAY_BIND:-lan}"

    log_info "Starting OpenClaw gateway on port $port..."
    cd "$OPENCLAW_INSTALL_DIR"

    # Source env vars
    set -a
    source "$SCRIPT_DIR/.env"
    set +a

    export NODE_ENV=production
    export PATH="$HOME/.bun/bin:$PATH"

    nohup node dist/index.js gateway --bind "$bind" --port "$port" --allow-unconfigured > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"

    sleep 5

    if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        log_ok "OpenClaw gateway started (PID $(cat "$PID_FILE"))"
    else
        log_error "Gateway failed to start. Check logs: $LOG_FILE"
        cat "$LOG_FILE"
        exit 1
    fi

    cd "$SCRIPT_DIR"
}

# --- Print status ---
print_status() {
    local port="${OPENCLAW_GATEWAY_PORT:-18789}"
    echo ""
    echo "============================================================"
    echo -e "${GREEN}  OpenClaw is now running!${NC}"
    echo "============================================================"
    echo ""
    echo "  Gateway UI:  http://localhost:${port}"
    echo "  Gateway Token: ${OPENCLAW_GATEWAY_TOKEN:0:8}..."
    echo "  Model: MiniMax M2.5"
    echo ""
    echo "  Useful commands:"
    echo "    View logs:    cat $LOG_FILE"
    echo "    Follow logs:  tail -f $LOG_FILE"
    echo "    Stop:         kill \$(cat $PID_FILE)"
    echo "    Restart:      $0 restart"
    echo "    Status:       $0 status"
    echo ""
    echo "  Install dir: $OPENCLAW_INSTALL_DIR"
    echo "  Config dir:  ~/.openclaw/"
    echo "  Full token saved in .env file."
    echo "============================================================"
}

# --- Status check ---
check_status() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        log_ok "OpenClaw gateway is running (PID $(cat "$PID_FILE"))"
        echo "  Port: ${OPENCLAW_GATEWAY_PORT:-18789}"
        echo "  Log:  $LOG_FILE"
    else
        log_warn "OpenClaw gateway is not running."
    fi
}

# --- Stop ---
stop_gateway() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        log_info "Stopping OpenClaw gateway (PID $(cat "$PID_FILE"))..."
        kill "$(cat "$PID_FILE")"
        sleep 2
        log_ok "Gateway stopped."
    else
        log_warn "Gateway is not running."
    fi
}

# --- Main ---
main() {
    local cmd="${1:-deploy}"

    case "$cmd" in
        deploy)
            echo ""
            echo "============================================================"
            echo "  OpenClaw Native Deployment"
            echo "============================================================"
            echo ""
            check_dependencies
            setup_env
            install_bun
            clone_source
            build_project
            setup_config
            start_gateway
            print_status
            ;;
        start)
            setup_env
            start_gateway
            print_status
            ;;
        stop)
            stop_gateway
            ;;
        restart)
            setup_env
            stop_gateway
            start_gateway
            print_status
            ;;
        status)
            setup_env
            check_status
            ;;
        *)
            echo "Usage: $0 {deploy|start|stop|restart|status}"
            exit 1
            ;;
    esac
}

main "$@"
