# SCC Office Dashboard — Project Brief
**Codename:** The Office
**Budget:** $30 total (est. $10-15 build cost)
**Owner:** Harvey Bremner (COO, SCC)
**Engineering Director:** Clawdia

---

## What We're Building
A real-time agent monitoring dashboard — Apple-design-language, responsive (desktop + mobile), password-protected. Harvey can see every agent, what they're doing, and what they're spending.

## Three Views

### 1. 🏢 The Floor (default)
- Agent cards in Apple-style grid
- Each card: name, emoji, status (Active/Idle/Running), current task in plain English, last seen
- Visual pulse when processing
- Click agent → mid-level plain-English status summary

### 2. 💰 The Ledger
- Running total spend: today / week / month / all time
- Per-agent and per-provider cost breakdown
- Hourly sparkline charts
- $500/month budget — amber warning at $400, red at $475
- Telegram alert when $400 and $500 thresholds hit

### 3. 📋 The Feed
- Chronological activity timeline (today's agent actions)
- Filterable by agent
- Plain English summaries — no technical jargon

## Design Spec
- Apple Human Interface Guidelines: SF Pro font stack, white/off-white backgrounds, subtle drop shadows, rounded-2xl cards
- Light mode only (Apple default)
- Responsive: desktop-first, fully functional on iPhone/iPad
- Password-protected login (clean Apple-style login screen)

## Tech Stack
- **Frontend:** React 19 + Vite + Tailwind CSS (Apple token layer)
- **Backend:** Node.js + Express
- **Database:** Replit DB (cost history persistence)
- **Data sources:**
  - OpenClaw logs: `/tmp/openclaw/openclaw-YYYY-MM-DD.log`
  - OpenClaw sessions: `openclaw sessions list` (polled via bridge)
  - Anthropic usage: Anthropic API usage endpoint
  - Gemini usage: Google Cloud billing API (with schema ready for future providers)
- **Refresh:** 60-second polling (no WebSockets)
- **Deployment:** Replit (Static deployment for frontend, Autoscale for backend API)
- **GitHub repo:** `harveyb-scc/scc-office-dashboard`

## Agent Roster (for dashboard)
| Agent | Emoji | Type |
|-------|-------|------|
| Clawdia | 🦞 | Main orchestrator |
| Security Agent | 🔒 | Autonomous |
| Self-Improvement Agent | 🌙 | Autonomous |
| Marcus | ⚙️ | Dev sub-agent |
| Sienna | 🎨 | Dev sub-agent |
| Dex | 🔗 | Dev sub-agent |
| Nadia | 🗄️ | Dev sub-agent |
| Eli | 🔍 | Dev sub-agent |
| Zara | 🧪 | Dev sub-agent |
| Roan | 🔒 | Dev sub-agent |
| Imogen | 🖼️ | Dev sub-agent |
| Cass | ✍️ | Dev sub-agent |
| Otto | 📦 | Dev sub-agent |
| Phoebe | 📊 | Dev sub-agent |

## Cost Thresholds
- $400/month → amber warning + Telegram alert to Harvey
- $475/month → red warning
- $500/month → critical alert + Telegram alert to Harvey

## Build Phases
1. Imogen → UX spec + user flows
2. Cass → all copy and microcopy
3. Nadia → data schema
4. Marcus → backend API
5. Sienna → frontend implementation
6. Dex → OpenClaw log integration + cost polling
7. Phoebe → analytics instrumentation spec
8. Roan → security review
9. Zara → QA testing
10. Eli → code review
11. Otto → GitHub repo setup + Replit deployment
