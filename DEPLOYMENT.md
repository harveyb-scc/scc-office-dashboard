# SCC Office Dashboard — Deployment Guide
**Codename:** The Office
**Author:** Otto (DevOps, SCC)
**Last updated:** 2026-03-17

---

## Architecture Overview

| Component | Replit Deployment Type | Description |
|-----------|----------------------|-------------|
| `backend/` | **Autoscale** | Node.js + Express REST API on port 3000 |
| `frontend/` | **Static** | React 19 + Vite — CDN-hosted, calls `/api/*` |

The frontend calls `/api/*` paths. In production the backend must be deployed first, and the frontend's API base URL configured to point at the backend's Replit URL.

---

## Step 1 — Deploy the Backend (Autoscale)

### 1.1 Create a new Replit from GitHub

1. Go to [replit.com](https://replit.com) and click **+ Create Repl**
2. Choose **Import from GitHub**
3. Connect the repo: `harveyb-scc/scc-office-dashboard`
4. Set the **root directory** to `backend/`
5. Replit will detect the `.replit` config automatically

### 1.2 Configure Replit Secrets

Navigate to **Tools → Secrets** in the Replit sidebar and add every secret below.
**Do not commit secrets to the repository.**

| Secret Key | Description | Example / Notes |
|------------|-------------|-----------------|
| `NODE_ENV` | Runtime environment | `production` |
| `SESSION_SECRET` | Express session signing key — long random string | `openssl rand -hex 64` |
| `DASHBOARD_PASSWORD_HASH` | bcrypt hash of Harvey's dashboard password | Generate with `node -e "const b=require('bcryptjs');console.log(b.hashSync('YOUR_PASSWORD',12))"` |
| `ANTHROPIC_API_KEY` | Anthropic API key for usage polling | From Anthropic console |
| `OPENAI_API_KEY` | OpenAI API key (future provider support) | From OpenAI console |
| `REPLIT_DB_URL` | Replit DB connection URL | Auto-populated by Replit when DB is enabled |
| `OPENCLAW_LOG_PATH` | Path to OpenClaw log directory | `/tmp/openclaw` (default on host Mac) |

> **Note:** `REPLIT_DB_URL` is automatically injected by Replit when you enable the Database add-on under **Tools → Database**. Enable it before first deploy.

### 1.3 Enable Replit Database

1. In the Replit sidebar, go to **Tools → Database**
2. Click **Enable Replit Database**
3. `REPLIT_DB_URL` will be automatically added to your Secrets

### 1.4 Deploy

1. Click **Deploy** in the top-right corner
2. Select deployment type: **Autoscale**
3. Confirm the run command: `npm run build && npm run start`
4. Click **Deploy**

Note the backend URL — it will look like:
`https://scc-office-dashboard-backend.<your-username>.replit.app`

---

## Step 2 — Deploy the Frontend (Static)

### 2.1 Create a second Replit from GitHub

1. Go to [replit.com](https://replit.com) and click **+ Create Repl**
2. Choose **Import from GitHub**
3. Connect the repo: `harveyb-scc/scc-office-dashboard`
4. Set the **root directory** to `frontend/`
5. Replit will detect the `.replit` config automatically

### 2.2 Configure the Backend URL

The frontend proxies `/api/*` to the backend. For production static deployment, you need to configure the backend URL:

1. Open `frontend/vite.config.ts`
2. The proxy target should point to your backend Replit URL for production builds
3. Alternatively, set the backend URL as a build-time variable `VITE_API_BASE_URL`

> **Current config:** The frontend uses relative `/api/*` paths proxied in development. For static Replit deployment, ensure your backend is accessible and configure CORS appropriately in the backend.

### 2.3 Deploy

1. Click **Deploy** in the top-right corner
2. Select deployment type: **Static**
3. Confirm the build command: `npm run build`
4. Confirm the public directory: `dist`
5. Click **Deploy**

Note the frontend URL — it will look like:
`https://scc-office-dashboard.<your-username>.replit.app`

---

## Step 3 — Connect Replit to GitHub (Auto-deploy)

For automatic deploys on push to `main`:

1. In each Replit project, go to **Settings → Git**
2. Confirm the GitHub repo is connected: `harveyb-scc/scc-office-dashboard`
3. Enable **Auto-deploy on push** and set the branch to `main`

With this configured, every merge to `main` triggers a fresh build and deploy.

---

## Post-Deploy Verification Checklist

Run through this checklist after every production deploy:

### Backend Health
- [ ] `GET https://<backend-url>/health` returns `{"status":"ok","uptime":<seconds>}` with HTTP 200
- [ ] Response time < 500ms

### Login Test
- [ ] Navigate to the frontend URL
- [ ] Apple-style login screen loads correctly
- [ ] Enter Harvey's password — should redirect to The Floor view
- [ ] Incorrect password returns an error (does not redirect)

### Agent Cards (The Floor)
- [ ] Agent grid renders with all 14 agents listed
- [ ] Each card shows: name, emoji, status, last seen
- [ ] At least one agent shows status (Active/Idle/Running)
- [ ] Clicking an agent card opens the detail panel

### The Ledger (Cost View)
- [ ] Today's spend displays (may be $0.00 on first deploy)
- [ ] Weekly/monthly/all-time totals render
- [ ] No error state shown in the cost breakdown
- [ ] Budget threshold indicators render (amber at $400, red at $475)

### The Feed (Activity View)
- [ ] Timeline renders (may be empty on first deploy)
- [ ] Agent filter dropdown works

### Full Round-Trip
- [ ] Logout button returns to login screen
- [ ] Session persists on page refresh (within session TTL)

---

## Rollback Procedure

If any post-deploy check fails:

### Quick Rollback (Replit)

1. Go to the affected Replit project (backend or frontend)
2. Click **Deployments** in the sidebar
3. Find the last known-good deployment in the history
4. Click **Redeploy** on that version
5. Verify the health endpoint returns 200 within 2 minutes
6. Run the post-deploy verification checklist

### If Database State Is Corrupted

1. Contact Nadia (DB schema owner) before taking any action
2. Do not attempt to manually edit Replit DB entries
3. If cost history is corrupted: the backend will reinitialise on restart (data loss acceptable — cost data is derived, not source of truth)

### Escalation

| Scenario | Action |
|----------|--------|
| Health endpoint non-200 | Rollback immediately, notify Clawdia |
| Login broken | Rollback immediately, notify Clawdia |
| Agent cards not loading | Check backend logs, notify Marcus |
| Cost data wrong | Do not rollback — notify Dex + Nadia |
| Frontend not building | Check Vite build logs, notify Sienna |

### Notification

After any rollback, post an incident summary to Clawdia with:
- What was deployed
- What failed (symptom)
- Rollback taken at (timestamp)
- Next steps

---

## Environment Variable Reference

### Backend `.env.example`

```env
NODE_ENV=production
SESSION_SECRET=<generate with: openssl rand -hex 64>
DASHBOARD_PASSWORD_HASH=<bcrypt hash of dashboard password>
ANTHROPIC_API_KEY=<from Anthropic console>
OPENAI_API_KEY=<from OpenAI console>
REPLIT_DB_URL=<auto-injected by Replit>
OPENCLAW_LOG_PATH=/tmp/openclaw
```

---

## Notes

- The `.replit` config files in `backend/` and `frontend/` are excluded from the repo via `.gitignore` — Replit generates its own from the deployment configuration.
- `node_modules/`, `dist/`, `.env` files, and logs are all gitignored. Do not commit them.
- Production secrets are owned by Otto and Clawdia only. Dev environment uses separate, non-production secrets.
- Roan (Security) should be consulted before any secrets rotation or scope changes.
