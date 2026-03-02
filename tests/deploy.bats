#!/usr/bin/env bats

# Tests for deploy.sh
# Run with: bats tests/deploy.bats

setup() {
  SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  export SCRIPT_DIR
}

@test "deploy.sh exists and is executable" {
  [ -x "$SCRIPT_DIR/deploy.sh" ]
}

@test "deploy.sh prints usage for unknown command" {
  run bash "$SCRIPT_DIR/deploy.sh" unknown_command
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage:"* ]]
}

@test ".env.example exists and contains required variables" {
  [ -f "$SCRIPT_DIR/.env.example" ]
  grep -q "OPENCLAW_GATEWAY_TOKEN" "$SCRIPT_DIR/.env.example"
  grep -q "OPENCLAW_GATEWAY_PORT" "$SCRIPT_DIR/.env.example"
  grep -q "OPENCLAW_VERSION" "$SCRIPT_DIR/.env.example"
}

@test "Dockerfile exists and uses node:22 base image" {
  [ -f "$SCRIPT_DIR/Dockerfile" ]
  grep -q "FROM node:22" "$SCRIPT_DIR/Dockerfile"
}

@test "docker-compose.yml exists and defines gateway service" {
  [ -f "$SCRIPT_DIR/docker-compose.yml" ]
  grep -q "openclaw-gateway" "$SCRIPT_DIR/docker-compose.yml"
}

@test "deploy.sh contains all required functions" {
  grep -q "check_dependencies()" "$SCRIPT_DIR/deploy.sh"
  grep -q "setup_env()" "$SCRIPT_DIR/deploy.sh"
  grep -q "clone_source()" "$SCRIPT_DIR/deploy.sh"
  grep -q "build_project()" "$SCRIPT_DIR/deploy.sh"
  grep -q "start_gateway()" "$SCRIPT_DIR/deploy.sh"
  grep -q "stop_gateway()" "$SCRIPT_DIR/deploy.sh"
}

@test "deploy.sh supports all required commands" {
  grep -q "deploy)" "$SCRIPT_DIR/deploy.sh"
  grep -q "start)" "$SCRIPT_DIR/deploy.sh"
  grep -q "stop)" "$SCRIPT_DIR/deploy.sh"
  grep -q "restart)" "$SCRIPT_DIR/deploy.sh"
  grep -q "status)" "$SCRIPT_DIR/deploy.sh"
}

@test "default gateway port is 18789" {
  grep -q "18789" "$SCRIPT_DIR/deploy.sh"
  grep -q "18789" "$SCRIPT_DIR/.env.example"
}
