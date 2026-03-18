# SCC Office Dashboard — "The Office"

A real-time AI agent monitoring dashboard for SCC, tracking agent activity, status, and spending.

## Architecture

- **Frontend**: React 19 + Vite + Tailwind CSS + TanStack Query, running on port 5000
- **Backend**: Express 4 + TypeScript + Replit DB, running on port 3000
- **Auth**: Password-protected with HTTP-only session cookies + bcrypt hashing

## Running the App

Two workflows run simultaneously:
- **Start application** — Vite dev server on port 5000 (the webview)
- **Backend API** — Express API on port 3000

The frontend proxies `/api/*` requests to the backend automatically.

## Environment Variables / Secrets Required

| Key | Description |
|-----|-------------|
| `SESSION_SECRET` | Long random string for signing session cookies |
| `DASHBOARD_PASSWORD_HASH` | bcrypt hash of the dashboard password (default: `admin`) |
| `ANTHROPIC_API_KEY` | Optional — for cost tracking via Anthropic usage API |
| `TELEGRAM_BOT_TOKEN` | Optional — for budget alert notifications |
| `TELEGRAM_CHAT_ID` | Optional — Telegram chat ID for alerts |

The default login password is **admin** (from the DASHBOARD_PASSWORD_HASH set during setup).

## Views

- **The Floor** — Agent status grid (Active/Idle/Running)
- **The Ledger** — Cost tracking and budget thresholds ($400 amber, $475 red, $500 critical)
- **The Feed** — Chronological activity timeline

## Key Files

- `frontend/vite.config.ts` — Vite config with host=0.0.0.0, port=5000, allowedHosts=true, proxy to :3000
- `backend/src/config/index.ts` — Zod-validated env schema
- `backend/src/index.ts` — Express app entry point with CORS, auth middleware, routes
- `backend/src/integrations/` — OpenClaw log parser and Anthropic usage poller
