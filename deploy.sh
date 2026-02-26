#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# OpenClaw Deployment Script
# Automates build, configuration, and startup
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

# --- Pre-flight checks ---
check_dependencies() {
    log_info "Checking dependencies..."
    local missing=()

    if ! command -v docker &>/dev/null; then
        missing+=("docker")
    fi

    if ! docker compose version &>/dev/null 2>&1; then
        missing+=("docker-compose-v2")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing[*]}"
        log_error "Please install Docker with Compose v2 and try again."
        exit 1
    fi

    log_ok "All dependencies found."
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
        # Write token back to .env
        if grep -q "^OPENCLAW_GATEWAY_TOKEN=" .env; then
            sed -i "s/^OPENCLAW_GATEWAY_TOKEN=.*/OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}/" .env
        else
            echo "OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}" >> .env
        fi
        log_ok "Gateway token generated and saved to .env"
    fi
}

# --- Create data directories ---
setup_directories() {
    local config_dir="${OPENCLAW_CONFIG_DIR:-./data/config}"
    local workspace_dir="${OPENCLAW_WORKSPACE_DIR:-./data/workspace}"

    log_info "Setting up data directories..."
    mkdir -p "$config_dir" "$workspace_dir"
    log_ok "Data directories ready: $config_dir, $workspace_dir"
}

# --- Build Docker image ---
build_image() {
    log_info "Building OpenClaw Docker image (this may take a few minutes on first run)..."
    docker compose build openclaw-gateway
    log_ok "Docker image built successfully."
}

# --- Run onboarding ---
run_onboarding() {
    log_info "Running OpenClaw onboarding..."
    docker compose run --rm openclaw-cli onboard --no-daemon || {
        log_warn "Onboarding skipped or encountered issues. You can run it manually later:"
        log_warn "  docker compose run --rm openclaw-cli onboard"
    }
}

# --- Start services ---
start_services() {
    log_info "Starting OpenClaw gateway..."
    docker compose up -d openclaw-gateway
    log_ok "OpenClaw gateway started!"
}

# --- Print status ---
print_status() {
    echo ""
    echo "============================================================"
    echo -e "${GREEN}  OpenClaw is now running!${NC}"
    echo "============================================================"
    echo ""
    echo "  Gateway UI:  http://localhost:${OPENCLAW_GATEWAY_PORT:-18789}"
    echo "  Gateway Token: ${OPENCLAW_GATEWAY_TOKEN:0:8}..."
    echo ""
    echo "  Useful commands:"
    echo "    View logs:      docker compose logs -f openclaw-gateway"
    echo "    Stop:           docker compose down"
    echo "    Restart:        docker compose restart openclaw-gateway"
    echo "    Open dashboard: docker compose run --rm openclaw-cli dashboard --no-open"
    echo "    Health check:   docker compose run --rm openclaw-cli doctor"
    echo ""
    echo "  Full token saved in .env file."
    echo "============================================================"
}

# --- Main ---
main() {
    echo ""
    echo "============================================================"
    echo "  OpenClaw Deployment Script"
    echo "============================================================"
    echo ""

    check_dependencies
    setup_env
    setup_directories
    build_image

    # Ask if user wants to run onboarding
    if [ "${1:-}" = "--skip-onboard" ]; then
        log_info "Skipping onboarding (--skip-onboard)."
    else
        run_onboarding
    fi

    start_services
    print_status
}

main "$@"
