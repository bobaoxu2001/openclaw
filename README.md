# OpenClaw Deployment

Self-hosted deployment configuration for [OpenClaw](https://github.com/openclaw/openclaw) — your personal, open-source AI assistant.

## Prerequisites

- **Docker** with Compose v2
- **2 GB+ RAM** (4 GB recommended)
- **10 GB+ disk space**
- An LLM API key (Anthropic, OpenAI, etc.)

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

The deploy script will:
1. Validate Docker is installed
2. Generate a gateway authentication token
3. Create data directories for persistent storage
4. Build the OpenClaw Docker image from source
5. Run the interactive onboarding wizard
6. Start the gateway service

## Configuration

Edit `.env` to customize your deployment:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Anthropic Claude API key |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENCLAW_GATEWAY_PORT` | `18789` | Gateway web UI port |
| `OPENCLAW_BRIDGE_PORT` | `18790` | Companion app bridge port |
| `OPENCLAW_GATEWAY_BIND` | `lan` | `lan` (all interfaces) or `localhost` |
| `OPENCLAW_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `OPENCLAW_VERSION` | `main` | Git branch/tag to build from |
| `OPENCLAW_INSTALL_BROWSER` | — | Set to `1` for Chromium support |

## Usage

```bash
# View gateway logs
docker compose logs -f openclaw-gateway

# Stop services
docker compose down

# Restart gateway
docker compose restart openclaw-gateway

# Get dashboard URL with auth token
docker compose run --rm openclaw-cli dashboard --no-open

# Run health check
docker compose run --rm openclaw-cli doctor

# Interactive CLI session
docker compose run --rm openclaw-cli
```

## Updating

```bash
# Pull latest source and rebuild
docker compose build --no-cache openclaw-gateway
docker compose up -d openclaw-gateway
```

Or set `OPENCLAW_VERSION` in `.env` to a specific tag before rebuilding.

## Data Persistence

All data is stored in mounted volumes:
- `./data/config/` — OpenClaw configuration, memory, API keys
- `./data/workspace/` — Workspace files accessible to the agent

## Security Notes

- The gateway runs as a non-root `node` user inside the container
- A unique gateway token is auto-generated on first deploy
- For production: set `OPENCLAW_GATEWAY_BIND=localhost` and use a reverse proxy with TLS
- Never expose port 18789 directly to the internet without authentication
- Keep your `.env` file secure — it contains API keys and tokens

## File Structure

```
.
├── Dockerfile           # Multi-stage build for OpenClaw
├── docker-compose.yml   # Service definitions (gateway + CLI)
├── deploy.sh            # Automated deployment script
├── .env.example         # Environment variable template
├── .gitignore           # Git ignore rules
└── data/                # Persistent data (created on deploy)
    ├── config/          # OpenClaw configuration
    └── workspace/       # Agent workspace files
```
