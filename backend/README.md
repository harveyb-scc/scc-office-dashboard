# SCC Office Dashboard — Backend API

Node.js + Express API for the SCC Office Dashboard. Provides agent status, cost tracking, activity feed, and authentication endpoints.

**Phase 4 — Built by Marcus (Senior Backend Engineer)**
**Spec:** `specs/DATA-SCHEMA.md` · `docs/PROJECT-BRIEF.md`

---

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js ≥ 20 |
| Framework | Express 4 |
| Language | TypeScript (strict) |
| Database | Replit DB (key-value) |
| Auth | HTTP-only session cookies + bcrypt |
| Validation | Zod |
| Security | Helmet + express-rate-limit + CORS |

---

## Quick Start (Local)

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values:

- `DASHBOARD_PASSWORD_HASH` — generate with:
  ```bash
  node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YOUR_PASSWORD', 12).then(console.log)"
  ```
- `SESSION_SECRET` — generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `REPLIT_DB_URL` — for local dev, create a free Replit DB at [replit.com](https://replit.com) and copy the URL from the Secrets tab

### 3. Start development server

```bash
npm run dev
```

API will be available at `http://localhost:3000`.

### 4. Verify

```bash
curl http://localhost:3000/api/health
```

---

## Replit Deployment

1. Set all secrets in **Replit Secrets** (never in `.replit` files or committed code):
   - `DASHBOARD_PASSWORD_HASH`
   - `SESSION_SECRET`
   - `OPENCLAW_LOG_PATH` (default: `/tmp/openclaw`)
   - `ANTHROPIC_API_KEY` (optional)
   - `ANTHROPIC_INPUT_PRICE_PER_MILLION_TOKENS` (default: `3.00`)
   - `ANTHROPIC_OUTPUT_PRICE_PER_MILLION_TOKENS` (default: `15.00`)
   - `GEMINI_INPUT_PRICE_PER_MILLION_TOKENS` (default: `0.075`)
   - `GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS` (default: `0.30`)
   - `TELEGRAM_BOT_TOKEN` (optional)
   - `TELEGRAM_CHAT_ID` (optional)
   - `REPLIT_DB_URL` (injected automatically by Replit)

2. Set deployment type to **Autoscale** in `.replit`
3. Build command: `npm run build`
4. Run command: `npm start`
5. PORT is set dynamically by Replit — the app reads `process.env.PORT` automatically

---

## API Reference

### Authentication

All protected endpoints require a valid session cookie (`scc_session`).

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/auth/login` | No | Log in and receive session cookie |
| `POST /api/auth/logout` | Yes | Invalidate session |
| `GET /api/health` | No | Health check |
| `GET /api/agents` | Yes | List all agents with status |
| `GET /api/agents/:id` | Yes | Single agent detail + recent activity + costs |
| `GET /api/costs` | Yes | Full cost summary (today/week/month/all-time) |
| `GET /api/costs/history` | Yes | Hourly sparkline data |
| `GET /api/feed` | Yes | Activity timeline |

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "YOUR_PASSWORD"}' \
  -c cookies.txt
```

### Query examples

```bash
# All agents
curl http://localhost:3000/api/agents -b cookies.txt

# Single agent
curl http://localhost:3000/api/agents/clawdia -b cookies.txt

# Cost summary
curl http://localhost:3000/api/costs -b cookies.txt

# Cost history (last 24h, Clawdia only)
curl "http://localhost:3000/api/costs/history?hours=24&agentId=clawdia" -b cookies.txt

# Feed (last 50 entries)
curl "http://localhost:3000/api/feed?limit=50" -b cookies.txt

# Feed (filtered by agent, paginated)
curl "http://localhost:3000/api/feed?agentId=marcus&limit=20" -b cookies.txt
```

---

## Response Envelope

All responses use the `ApiResponse<T>` envelope:

**Success:**
```json
{ "ok": true, "data": { ... } }
```

**Error:**
```json
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "Human-readable message." } }
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 5 failed attempts per IP per 15 min |
| All `/api/*` routes | 120 requests per IP per minute |

---

## Cost Calculation

Costs are stored as **integer cents** (USD) to avoid floating-point drift.

```
costCents = ROUND(
  (inputTokens / 1_000_000 × inputPriceUSD +
   outputTokens / 1_000_000 × outputPriceUSD)
  × 100
)
```

Token counts (not dollar values) are stored in Replit DB. Dollar values are computed at read time from current pricing environment variables — this allows retroactive recalculation when pricing changes.

---

## Budget Thresholds

| Level | Trigger |
|-------|---------|
| Amber | Monthly spend ≥ $400 |
| Red | Monthly spend ≥ $475 |
| Critical | Monthly spend ≥ $500 |

Telegram alerts are sent to Harvey at $400 and $500 crossings. Deduplication ensures each threshold is alerted at most once per calendar month.

---

## Project Structure

```
src/
  config/         — Environment variable validation (startup exits if invalid)
  constants/      — Agent roster (hardcoded from PROJECT-BRIEF.md)
  middleware/     — Auth session validation, rate limiting, error handler
  routes/         — Express router files (one per resource)
  services/       — Business logic (no Express dependencies)
    agentService    — Log parsing → AgentStatus objects
    costService     — Token usage → CostRecord storage + aggregation
    feedService     — Log parsing → FeedEntry storage + retrieval
    alertService    — Telegram notifications for budget thresholds
    dbService       — Replit DB singleton + helpers
  types/          — Canonical TypeScript interfaces (from DATA-SCHEMA.md)
  index.ts        — App setup and server start
```

---

## Handoff Notes

**For Dex (Phase 6 — Log Integration):**
- `costService.ts` exports `ingestTokenUsage(events)` — call this from your polling loop every 60 seconds with parsed token usage events
- `feedService.ts` exports `ingestFeedEntries()` — call this from your polling loop; it reads logs directly from `OPENCLAW_LOG_PATH`
- The feed cursor is stored at `meta:feed:cursor:<agentId>` — the service handles resume automatically

**For Zara (Phase 9 — QA):**
- All endpoints return consistent `{ ok, data/error }` envelopes
- Rate limiter kicks in after 5 failed logins per IP per 15 min — test this
- Session expires after 24 hours — verify cookie is cleared on logout
- Health endpoint at `/api/health` — check `checks.replitDb` for DB connectivity

**For Roan (Phase 8 — Security Review):**
- Session tokens: raw token in HTTP-only cookie; only SHA-256 hash stored in DB
- Password: bcrypt cost factor 12; never logged
- No sensitive data in any log lines
- All env vars validated at startup; app refuses to start if required vars missing
- CORS restricted to Replit domains in production
- `trust proxy` enabled for accurate IP rate limiting on Replit

---

---

## Known Audit Notes

**For Roan (Security Review):**

`npm audit` reports high-severity vulnerabilities in `node-tar` via `@mapbox/node-pre-gyp`, which is a transitive dependency of `bcrypt`'s native build tool chain. This dependency is only invoked at `npm install` time to compile the bcrypt C++ binding — it is not included in runtime code paths. The vulnerabilities (path traversal in archive extraction) cannot be exploited by API consumers.

Mitigation: `npm audit fix` cannot auto-resolve this without upgrading bcrypt to a version that doesn't use node-pre-gyp. If bcrypt releases a fix, upgrade. As a fallback, consider switching to `argon2` which has cleaner transitive dependencies.

*Built to Nadia's DATA-SCHEMA.md spec. Schema changes require Nadia review before touching Replit DB.*
