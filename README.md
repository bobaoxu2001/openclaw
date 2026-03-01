# OpenClaw Deployment

Self-hosted deployment configuration for [OpenClaw](https://github.com/openclaw/openclaw) — your personal, open-source AI assistant.

## Prerequisites

- **Node.js v22+** with pnpm
- **Git**
- **2 GB+ RAM** (4 GB recommended)
- **10 GB+ disk space**
- An LLM API key (MiniMax, Anthropic, OpenAI, etc.)

## Quick Start

```bash
# 1. Clone this repo
git clone <this-repo-url> && cd openclaw

# 2. Configure environment variables
cp .env.example .env
# Edit .env and add your API key(s)

# 3. Deploy
./deploy.sh
```

### macOS

```bash
# Install prerequisites via Homebrew
brew install node@22
corepack enable

# Then follow the steps above
```

On macOS, the source code is installed to `~/openclaw-src` by default (instead of `/opt/openclaw`).

The deploy script will:
1. Validate Node.js, pnpm, and git are installed
2. Install Bun (build dependency) if not present
3. Generate a gateway authentication token
4. Clone OpenClaw source from GitHub
5. Build the project (backend + UI)
6. Configure the gateway and model provider
7. Start the gateway service

## Configuration

Edit `.env` to customize your deployment:

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIMAX_API_KEY` | — | MiniMax API key |
| `ANTHROPIC_API_KEY` | — | Anthropic Claude API key |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENCLAW_GATEWAY_PORT` | `18789` | Gateway web UI port |
| `OPENCLAW_BRIDGE_PORT` | `18790` | Companion app bridge port |
| `OPENCLAW_GATEWAY_BIND` | `lan` | `lan` (all interfaces) or `localhost` |
| `OPENCLAW_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `OPENCLAW_VERSION` | `main` | Git branch/tag to build from |

## Usage

```bash
# Start gateway
./deploy.sh start

# Stop gateway
./deploy.sh stop

# Restart gateway
./deploy.sh restart

# Check status
./deploy.sh status

# View logs
tail -f /tmp/openclaw-gateway.log

# Full redeploy (rebuild from source)
./deploy.sh deploy
```

## Updating

```bash
# Re-run full deployment to pull latest source and rebuild
./deploy.sh deploy
```

Or set `OPENCLAW_VERSION` in `.env` to a specific tag before redeploying.

## Data Persistence

All data is stored in `~/.openclaw/`:
- `~/.openclaw/openclaw.json` — Configuration and model providers
- `~/.openclaw/workspace/` — Workspace files accessible to the agent

## Security Notes

- A unique gateway token is auto-generated on first deploy
- For production: set `OPENCLAW_GATEWAY_BIND=localhost` and use a reverse proxy with TLS
- Never expose port 18789 directly to the internet without authentication
- Keep your `.env` file secure — it contains API keys and tokens

## File Structure

```
.
├── deploy.sh            # Deployment and management script
├── .env.example         # Environment variable template
├── .env                 # Your configuration (created on deploy)
├── Dockerfile           # Docker build (alternative deployment)
├── docker-compose.yml   # Docker Compose services (alternative)
├── .gitignore           # Git ignore rules
└── README.md            # This file
```
