# Security Review — Replit Agent Changes
## SCC Office Dashboard
**Reviewer:** Roan (Application Security Engineer)
**Date:** 2026-03-18
**Review Type:** Post-change security assessment

---

## Summary of Changes Reviewed

| # | File | Change |
|---|------|--------|
| 1 | `backend/src/index.ts` | Added `.replit.dev` wildcard to dev-mode CORS allowed origins |
| 2 | `frontend/src/components/layout/AppShell.tsx` | Fixed `currentPath` → `location.pathname` for nav active state |
| 3 | `frontend/vite.config.ts` | Added `host: '0.0.0.0'`, `port: 5000`, `allowedHosts: true`, and `/api` proxy |

---

## Finding 1 — `.replit.dev` CORS Pattern (backend/src/index.ts)

### The Change
```js
const devOriginPatterns = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.replit\.dev(:\d+)?$/,   // ← NEW
];
```
This pattern is gated inside a `NODE_ENV !== 'production'` check. In production, CORS is locked to `config.ALLOWED_ORIGIN`.

### Risk Analysis

**Severity: Medium (dev environment only)**

The pattern `/\.replit\.dev(:\d+)?$/` matches **any subdomain of `replit.dev`** — not just SCC's own Replit workspace. This includes:
- `anything.replit.dev`
- `malicious-user-project.replit.dev`
- `attacker.replit.dev`

Replit is a shared hosting platform. Any Replit user can host a project on a `.replit.dev` subdomain. This means **any Replit-hosted page can make credentialed cross-origin requests to the dev backend** if the dev server is running and reachable from the internet.

**Conditions required for this to be exploitable:**
1. `NODE_ENV` is NOT set to `production` on the server
2. The backend dev server is publicly reachable (e.g., exposed via Replit's port forwarding or a tunnelling tool)
3. A developer is authenticated and has a valid session cookie

**Realistic attack scenario (if conditions above are met):**
A malicious Replit-hosted page tricks a developer into visiting it while authenticated to the SCC dev server. The page makes a cross-origin request that the browser permits because `.replit.dev` matches the CORS pattern. If credentials (cookies or tokens) are included in the request, the attacker could perform actions on behalf of the developer.

**Mitigations that reduce the risk:**
- The `NODE_ENV !== 'production'` gate is a meaningful control — this pattern will never reach production CORS if that gate is respected.
- Developers are unlikely to be browsing random Replit projects while authenticated to the dev backend simultaneously.

**However, the pattern is unnecessarily broad.** The correct approach is to allowlist the specific SCC Replit workspace URL(s), not the entire `*.replit.dev` domain space.

### Recommendation
Replace the wildcard pattern with the specific SCC Replit workspace subdomain(s):

```js
// INSTEAD OF:
/\.replit\.dev(:\d+)?$/,

// USE:
/^https:\/\/scc-office-dashboard\.[a-z0-9-]+\.replit\.dev(:\d+)?$/,
// or more simply, the exact known Replit preview URL:
/^https:\/\/your-specific-repl-name\.replit\.dev(:\d+)?$/,
```

Additionally, add a comment documenting the approved Replit workspace name so future engineers don't accidentally broaden the pattern again.

**Verdict on Change 1: REQUEST CHANGES**

---

## Finding 2 — `allowedHosts: true` in Vite Config (frontend/vite.config.ts)

### The Change
```js
server: {
  host: '0.0.0.0',
  port: 5000,
  allowedHosts: true,
  proxy: { '/api': { target: 'http://localhost:3000' } }
}
```

### Risk Analysis

**Severity: Low (dev server only, known pattern)**

`allowedHosts: true` in Vite disables the [DNS rebinding protection](https://vitejs.dev/config/server-options.html#server-allowedhosts) that Vite applies by default. Vite's default behaviour rejects requests from hostnames that don't match the server's configured host, which prevents DNS rebinding attacks against the dev server.

With `allowedHosts: true`, any hostname resolving to the machine running the Vite dev server can serve requests from the Vite dev process.

**DNS Rebinding Risk:**
DNS rebinding attacks against a local dev server require:
1. An attacker who can control DNS resolution to point a domain at the dev machine's IP
2. The dev server being reachable from outside the local network, OR the developer visiting the attacker's page on the same machine

This is a known and documented trade-off when running Vite inside Replit's containerised environment — without `allowedHosts: true`, Vite rejects requests routed through Replit's preview proxy because the `Host` header doesn't match `0.0.0.0` or `localhost`.

**`host: '0.0.0.0'`** binds Vite to all network interfaces, not just loopback. Inside a Replit container this is necessary for Replit's proxy to reach the dev server. Outside Replit (e.g., a developer's local machine), this exposes the Vite dev server on the local network.

**Important scoping note:** Vite's `server` config has zero effect on production builds. `vite build` output is static assets that are served by whatever the production host is. This risk is confined entirely to developer workstations and Replit preview environments.

**Mitigations that reduce the risk:**
- This is a dev-only tool; production is unaffected.
- Replit containers are isolated; network access is controlled by Replit's infrastructure.
- The Vite dev server serves the frontend only — it proxies `/api` to `localhost:3000` but does not expose any database or secrets directly.

### Recommendation
This is an acceptable trade-off for a Replit-based dev workflow, with one condition: **document the reason** so no future engineer sees `allowedHosts: true` and flags it as a mistake or "fixes" it in a way that breaks the Replit environment. Add an inline comment:

```js
server: {
  host: '0.0.0.0',   // Required: Replit's proxy needs to reach Vite on all interfaces
  port: 5000,
  allowedHosts: true, // Required: Replit preview hostname doesn't match 0.0.0.0; disables DNS-rebinding check (dev only)
  proxy: { '/api': { target: 'http://localhost:3000' } }
}
```

**Verdict on Change 2: APPROVE WITH CONDITIONS** (add explanatory comments)

---

## Finding 3 — Nav Active State Fix (frontend/src/components/layout/AppShell.tsx)

### The Change
Pure UI bug fix — `currentPath` replaced with `location.pathname` for determining active nav item.

### Risk Analysis

**Severity: None**

This is a presentational change with no security implications. No auth logic, no data handling, no permissions model is touched. The active state of a navigation item is cosmetic.

**Verdict on Change 3: APPROVE**

---

## New Security Risks Introduced

### Risk 1 — Overly Broad CORS Wildcard (Covered in Finding 1)
The `.replit.dev` pattern is the primary new risk surface introduced. It is contained to dev environments but is broader than necessary.

### Risk 2 — No Environment Enforcement at the Pattern Level
The `devOriginPatterns` array is gated on `NODE_ENV !== 'production'`. This is correct, but it relies on `NODE_ENV` being correctly set at deploy time. If `NODE_ENV` is accidentally unset or set to anything other than `"production"` in a staging or production deploy, the dev CORS patterns would activate.

**Recommendation:** Add a secondary guard or document the deployment requirement:
```ts
// Ensure NODE_ENV=production is explicitly required in deployment checklist
// and ideally enforced by CI/CD pipeline environment configuration.
```
Consider also logging a warning to the console if `devOriginPatterns` are active, so it is immediately visible during any server startup:
```ts
if (process.env.NODE_ENV !== 'production') {
  console.warn('[SECURITY] Dev CORS origins active. Ensure NODE_ENV=production in all deployed environments.');
}
```

### Risk 3 — `host: '0.0.0.0'` on Developer Machines
Developers running the Vite config locally (not inside Replit) will have their Vite dev server exposed on all local network interfaces, not just loopback. Anyone on the same network can reach the dev server. This is a low risk but worth noting — developers on public Wi-Fi (café, conference) are mildly more exposed.

**Recommendation:** Document in the project README or dev setup guide that `host: '0.0.0.0'` is intentional for Replit compatibility, and advise developers to use `host: 'localhost'` when working locally if not inside Replit.

---

## Overall Verdict

**APPROVE WITH CONDITIONS**

None of the changes introduce risks to the production environment. The production CORS lock (`config.ALLOWED_ORIGIN`) and the `NODE_ENV` gate are correctly implemented and should hold. The UI fix (Change 2) is clean.

The conditions before merge:

1. **[Required]** Tighten the `.replit.dev` CORS pattern to the specific SCC Replit workspace subdomain(s) only. A wildcard on a shared hosting platform is unnecessary and avoidable.
2. **[Required]** Add inline comments to `vite.config.ts` explaining why `allowedHosts: true` and `host: '0.0.0.0'` are present — this prevents future "cleanup" that breaks the Replit environment.
3. **[Recommended]** Add a server startup warning log when dev CORS patterns are active.
4. **[Recommended]** Add a note to the dev setup README about `host: '0.0.0.0'` and public Wi-Fi caution.

The architectural discipline here is sound. The dev/prod separation is correct. The issues are specificity and documentation — not fundamental design flaws.

---

*Reviewed by Roan | SCC Application Security Engineer*
*Classification: Internal — SCC Development Team*
