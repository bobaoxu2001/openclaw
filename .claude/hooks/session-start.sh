#!/bin/bash
set -euo pipefail

# Only run in remote (web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Installing linting and testing tools for OpenClaw deployment project..."

# Install ShellCheck (bash script linter)
if ! command -v shellcheck &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq shellcheck
fi

# Install hadolint (Dockerfile linter)
if ! command -v hadolint &>/dev/null; then
  curl -fsSL -o /usr/local/bin/hadolint \
    https://github.com/hadolint/hadolint/releases/download/v2.12.0/hadolint-Linux-x86_64
  chmod +x /usr/local/bin/hadolint
fi

# Install yamllint (YAML linter)
if ! command -v yamllint &>/dev/null; then
  pip install --quiet yamllint 2>/dev/null || pip3 install --quiet yamllint
fi

# Install bats-core (Bash Automated Testing System)
if ! command -v bats &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq bats
fi

echo "All tools installed successfully."
