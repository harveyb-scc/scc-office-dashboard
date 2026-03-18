# QA Test Plan — SCC Office Dashboard ("The Office")
**Author:** Zara — Senior QA Engineer, SCC Dev Team  
**Version:** 1.0  
**Date:** 2026-03-17  
**Status:** Ready for sign-off review  

---

## 1. Scope & What Was Tested

This plan covers the full test strategy for the SCC Office Dashboard at launch. The dashboard is a single-user, password-protected internal tool. Testing scope covers:

- The three views: The Floor (agent grid), The Ledger (cost tracking), The Feed (activity timeline)
- Login and session management
- Budget threshold alert states ($400 / $475 / $500)
- Accessibility compliance (WCAG 2.1 AA)
- Responsiveness (375px → 1440px)
- API security: authentication, rate limiting, input validation

Out of scope for this release: E2E OpenClaw log integration (requires live log fixtures — deferred to integration environment), Anthropic/Google billing API live data, Telegram alert delivery end-to-end.

---

## 2. Test Strategy by Level

```
             /      \
            /  E2E   \         ← Not in scope for v1 (no Playwright suite yet)
           /----------\           Will add for login + floor + ledger critical paths
          / Integration \      ← Supertest API tests — every endpoint, every status
         /--------------\
        /   Component     \    ← React Testing Library — behaviour, not internals
       /------------------\
      /     Unit            \  ← Service logic, cost calculations, log parsing
     /______________________\
```

### What automated suites exist

| Suite | File | Level | Tool |
|-------|------|-------|------|
| Auth endpoint tests | `backend/src/__tests__/auth.test.ts` | Integration | Jest + Supertest |
| Agents endpoint tests | `backend/src/__tests__/agents.test.ts` | Integration | Jest + Supertest |
| Costs endpoint tests | `backend/src/__tests__/costs.test.ts` | Integration | Jest + Supertest |
| Login component tests | `frontend/src/__tests__/Login.test.tsx` | Component | Vitest + RTL |
| AgentCard component tests | `frontend/src/__tests__/AgentCard.test.tsx` | Component | Vitest + RTL |

---

## 3. Test Coverage Summary

### Backend

| Endpoint | Scenarios Covered | Notes |
|----------|------------------|-------|
| `POST /api/auth/login` | Correct password, wrong password, missing body, rate limit (6th attempt) | Rate limit uses unique IP per test to prevent cross-test contamination |
| `POST /api/auth/logout` | Valid session (authenticated), no session | Session cookie set/cleared validated |
| `GET /api/agents` | Authenticated, unauthenticated, empty log state | Returns full roster (14 agents) with status |
| `GET /api/agents/:id` | Valid id, invalid id, unauthenticated | 404 for unknown agent IDs |
| `GET /api/costs` | Authenticated, all four alert threshold states (normal/amber/red/critical) | Budget alertLevel field validated |
| `GET /api/costs/history` | Authenticated, empty history, invalid hours param, invalid agentId | Dense hourly array validated |

**Not covered by automated tests (manual or deferred):**
- `POST /api/auth/logout` with expired session (edge case — session TTL is 24h)
- `GET /api/feed` routes (similar pattern to agents — add in v1.1)
- `GET /api/health` (add smoke test in v1.1)
- Log parsing service (unit tests needed for `parseTokenUsageFromLogs` with fixture log files)
- Cost calculation precision (`calcCostCents` — unit test needed)

### Frontend

| Component | Acceptance Criteria Covered |
|-----------|---------------------------|
| Login | AC-LOGIN-01 through AC-LOGIN-04 (redirect, success, error, loading states) |
| Login | Rate limit lockout UI, password show/hide, keyboard tab order |
| AgentCard | AC-FLOOR-01, AC-FLOOR-04, AC-PANEL-01, AC-A11Y-05 |
| AgentCard | All 5 status badge variants, keyboard activation, ARIA correctness |

**Not covered by automated component tests:**
- Floor/Ledger/Feed page-level components (integration-level tests deferred to v1.1)
- AgentDetailPanel (sheet vs panel layout, focus trapping — needs RTL + user-event)
- BudgetProgressBar colour states (requires visual regression or manual check)
- SkeletonLoader shimmer (visual — manual only)
- SparklineChart (requires chart library mock)
- Responsive layout breakpoints (manual or Playwright viewport tests)

---

## 4. Required Setup & Dependencies

### Backend (`backend/`)

Install:
```bash
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest
```

Add to `backend/package.json`:
```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage"
},
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "testMatch": ["**/__tests__/**/*.test.ts"],
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/src/$1"
  }
}
```

### Frontend (`frontend/`)

Install:
```bash
npm install --save-dev vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom msw
```

Add to `frontend/vite.config.ts` (or create `vitest.config.ts`):
```ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/__tests__/setup.ts'],
}
```

Create `frontend/src/__tests__/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

---

## 5. Manual Test Checklist (for Harvey)

Plain English — no technical knowledge required. Do this on both desktop and iPhone.

### ✅ Login

- [ ] Go to the app URL — you should be sent to the login screen automatically
- [ ] Enter the wrong password — you should see a red error message appear, the field should clear
- [ ] Enter the correct password — you should land on The Floor (agent grid) smoothly
- [ ] Try navigating to `/ledger` without logging in — you should end up back at login
- [ ] Log in after trying to go to `/ledger` — you should land on The Ledger, not The Floor
- [ ] Try the password 5 times wrong in a row — you should see a countdown timer appear ("Try again in 15 minutes") and the form locks
- [ ] Click the eye icon in the password field — you should be able to see/hide your password
- [ ] Tab through the login form using keyboard only — focus should move: field → eye icon → Sign In button

### ✅ The Floor

- [ ] After logging in, you should see a grid of 14 agent cards
- [ ] Each card should show: the agent's emoji, name, a coloured status badge, a task description, and "Last seen X ago"
- [ ] If an agent is running/active, the card should have a subtle animated border (if it's not, that's fine — may be idle)
- [ ] Click any agent card — a detail panel should appear (a popup on desktop, slides up from bottom on phone)
- [ ] The detail panel should show the agent's name, status, last task, and some recent activity
- [ ] Close the panel (tap outside or press the × button) — you should return to the grid
- [ ] Wait 60 seconds — the "Updated X ago" counter should reset to "just now" as data refreshes

### ✅ The Ledger

- [ ] Click "The Ledger" tab/link — you should see spending numbers: Today / Week / Month / All Time
- [ ] You should see a progress bar showing how much of the $500 monthly budget has been used
- [ ] If spending is under $400, the bar should be green with no warning banner
- [ ] If spending is between $400–$474, the bar and a warning banner should be amber/orange
- [ ] If spending hits $475+, both should turn red
- [ ] Try dismissing the alert banner (the × button) — it should disappear for the session
- [ ] You should see a table of all 14 agents with their costs
- [ ] Click a column header (Today / This Week / This Month) — the table should sort by that column

### ✅ The Feed

- [ ] Click "The Feed" tab/link — you should see a timeline of today's agent activity (newest at top)
- [ ] Each entry should show: emoji, agent name, "X mins ago", and a plain English description
- [ ] Click on an agent's name chip above the list — the feed should filter to just that agent
- [ ] Click "All agents" — the full feed should return
- [ ] If there's no activity for a filtered agent, you should see an appropriate empty message (not a blank screen)

### ✅ Accessibility (Basic Check)

- [ ] Tab through the entire page using only the keyboard — you should be able to reach every button and link
- [ ] Press Enter or Space on an agent card — the detail panel should open (same as clicking)
- [ ] When the detail panel is open, pressing Escape should close it and focus should return to the card

### ✅ Mobile (do on iPhone or narrow browser window)

- [ ] The app should fit on screen with no sideways scrolling
- [ ] Navigation should appear at the BOTTOM of the screen as a tab bar
- [ ] Agent cards should stack in a single column
- [ ] The agent detail panel should slide up from the bottom as a sheet
- [ ] Filter chips on The Feed should scroll horizontally

---

## 6. Known Risks & Edge Cases

### 🔴 High Risk

| Risk | Detail | Mitigation |
|------|--------|-----------|
| Replit DB unavailability | If the DB is unreachable, auth fails (no sessions), and cost history is unavailable. The app will return 500 errors. | Graceful degradation is partially implemented; a specific "DB offline" error state in the UI would improve resilience. Flag to Marcus. |
| Log file parsing errors | `agentService` and `costService` both read log files directly. If the log format changes or the log path doesn't exist, the service degrades silently to empty/offline states. | Covered by graceful fallback to cached state, but no alert is surfaced. |
| Rate limit bypass | Rate limiting is keyed on IP/X-Forwarded-For. Behind certain proxies, all requests may appear to come from the same IP, locking out the single legitimate user. | Verify `trust proxy` config matches Replit's actual proxy setup before production. |
| Session token exposure | Sessions use httpOnly cookies (good), but `skipSuccessfulRequests: true` on the rate limiter means a successful login resets the count — an attacker who knows the password can bypass the rate limit by alternating correct/incorrect. | Low risk for single-user internal tool, but noted. |

### 🟡 Medium Risk

| Risk | Detail |
|------|--------|
| $475 threshold | UX spec open question #1: does $475 trigger a Telegram alert? Currently only in-app red state. Confirm with Harvey before go-live. |
| Session persistence | Open question #3: sessions survive browser close (cookie-based, 24h TTL). Harvey should know he'll stay logged in for up to 24 hours unless explicitly logging out. |
| Agent roster is hardcoded | `AGENT_ROSTER` in constants is the source of truth. Adding/removing agents requires a code deployment. |
| Cost data is cents (integers) | All cost figures are stored as integer cents. Display layer must divide by 100. A display bug would show e.g. "$34218" instead of "$342.18". Check all display functions. |
| Empty `currentTask` | When an agent has no recent log activity, `currentTask` is null. The AgentCard shows "No active task" — confirm this is the correct fallback copy with Cass. |

### 🟢 Low Risk / Edge Cases Noted

- `prefers-reduced-motion`: All animations (pulse, shimmer) should be disabled. This is in the spec and CSS — spot-check on macOS Accessibility settings.
- Very long task descriptions: `AgentCard` uses `line-clamp-2`, so descriptions are truncated at 2 lines. Test with the longest realistic task string.
- Multiple tabs: If Harvey has the dashboard open in two tabs, session count management in the DB (`meta:auth:session-count`) could have a race condition. Cosmetic only — doesn't affect security.
- Budget progress bar at exactly 100%: `fractionUsed = Math.min(monthCents / BUDGET_CAP_CENTS, 1)` — clamps correctly. Test at $500 and $501.
- Timezone: The "today" cost window is determined server-side as UTC date. If Harvey is in Vancouver (UTC-7/8), "today" on the Ledger resets at 4/5 PM, not midnight. Confirm expected behaviour with Harvey.

---

## 7. Sign-Off Criteria

The build passes QA when **all** of the following are true:

### Automated gates (must be green)
- [ ] All backend Supertest suites pass: `npm test` exits 0
- [ ] All frontend RTL suites pass: `npm test` exits 0
- [ ] No TypeScript errors: `tsc --noEmit` in both `frontend/` and `backend/`
- [ ] No ESLint errors: `npm run lint` in both workspaces

### Manual sign-off gates
- [ ] Harvey has completed the Manual Test Checklist above on desktop Chrome and iPhone Safari
- [ ] All P0 and P1 bugs are resolved. No open P0/P1 issues.
- [ ] The $400 amber threshold and $500 critical threshold Telegram alerts have been tested in staging (requires Harvey's Telegram account)
- [ ] Login rate limit has been manually verified: 5 wrong attempts → lockout UI appears
- [ ] Keyboard navigation verified end-to-end by Zara or Sienna (Tab, Enter, Escape, arrow keys on filter chips)
- [ ] Roan has completed security review — no open items above P2

### Acceptance criteria pass rate
- All AC items from UX-SPEC.md §10 (AC-LOGIN-01 through AC-RESPONSIVE-02) are verified as passing
- Open questions from UX-SPEC.md §11 items 1, 2, 3 resolved by Harvey/Marcus before production deployment

---

## 8. Test Data & Fixtures

- **Correct password hash**: Test suite uses a bcrypt hash of `"testpassword"` generated at `$2b$12$...`. Set `DASHBOARD_PASSWORD_HASH` in `.env.test`.
- **Session token**: Tests generate a deterministic raw token (`'a'.repeat(64)`) and compute its sha256 hash. No real token entropy required for tests.
- **Agent roster**: The full 14-agent roster from `constants/agents.ts` is used as-is. No seed data required.
- **Cost records**: Created inline in each cost test via `getCostSummary` service mock.

---

*Zara — SCC Dev Team | zara@scc*  
*Questions? Same-day response during build phase.*
