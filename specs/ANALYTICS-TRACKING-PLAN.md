# SCC Office Dashboard — Analytics Tracking Plan
**Spec Author:** Phoebe (Analytics Engineer, SCC Dev Team)
**Version:** 1.0
**Date:** 2026-03-17
**Status:** Ready for implementation by Sienna (frontend) and Marcus (backend)

---

> **To Sienna:** This doc tells you exactly which component fires which event, with the full event name and all required properties. Implement these as calls to the backend `/api/analytics/event` endpoint. Do not instrument anything not on this list. Do not skip anything that is on this list.
>
> **To Marcus:** Events are logged server-side via the structured logger — no third-party service. Expose `POST /api/analytics/event` (accepts the payload defined in §3). Log with level `info`, tag `analytics`. That's it.

---

## Table of Contents

1. [Business Questions](#1-business-questions)
2. [Event Taxonomy](#2-event-taxonomy)
3. [Standard Properties (All Events)](#3-standard-properties-all-events)
4. [Key Metrics](#4-key-metrics)
5. [Privacy Rules](#5-privacy-rules)
6. [Implementation Notes for Sienna](#6-implementation-notes-for-sienna)

---

## 1. Business Questions

These are the three decisions that analytics data must enable. Every event in this plan feeds at least one of them. If a proposed event doesn't feed any of these, it doesn't ship.

### BQ-1: Is the dashboard actually being used?
**Decision it enables:** Whether to invest in new features, or whether the dashboard is a vanity build that Harvey checks once a week.

**Answered by:** DAU, session length, return rate, most-visited views. If Harvey is logging in daily and spending 2–3 minutes per session, the tool is earning its keep. If sessions are <30 seconds, something is wrong with the data or the UX.

---

### BQ-2: Which agents and features demand the most attention?
**Decision it enables:** Which agents to prioritise for reliability improvements; which parts of the dashboard UI are pulling Harvey's focus vs. going ignored.

**Answered by:** Agent card click frequency (which agents is Harvey checking on most?), budget alert view rate, feed filter usage (which agents is Harvey auditing?), error encounter rate by feature.

---

### BQ-3: Where does the dashboard break or confuse?
**Decision it enables:** Bug prioritisation and UX iteration. If Harvey hits the same error three times in a week, it's P0. If a feature is never touched, it may be unnecessary.

**Answered by:** Error event frequency and type, session drop-off after error events, retry rates.

---

## 2. Event Taxonomy

All events use `action_object` naming in `snake_case`. Every event carries the standard properties defined in §3 — those are not repeated in each event's property list below.

---

### 2.1 Login / Logout

#### `session_started`
**Trigger:** User successfully authenticates and is redirected to The Floor (or redirect target).

| Property | Type | Description |
|----------|------|-------------|
| `redirect_target` | string | Route the user landed on post-login. `"/"`, `"/ledger"`, `"/feed"` |
| `auth_latency_ms` | number | Time in ms from form submit to successful redirect |

---

#### `login_failed`
**Trigger:** Authentication attempt returns an error (wrong password, network failure, lockout).

| Property | Type | Description |
|----------|------|-------------|
| `failure_reason` | string | `"wrong_password"` \| `"network_error"` \| `"account_locked"` |
| `attempt_number` | number | Which attempt this was in the current session (1–5+) |

> **Privacy note:** Do not log the password value or any fragment of it. `failure_reason` only.

---

#### `session_ended`
**Trigger:** User clicks the Logout button. Also fired server-side if session token expires (backend-initiated).

| Property | Type | Description |
|----------|------|-------------|
| `session_duration_seconds` | number | Total seconds from `session_started` to this event |
| `initiated_by` | string | `"user"` \| `"server"` (token expiry) |
| `views_visited` | array of strings | Ordered list of views visited, e.g. `["floor", "ledger", "feed"]` |

---

### 2.2 View Navigation

#### `view_navigated`
**Trigger:** User navigates to a new primary view — The Floor, The Ledger, or The Feed. Fired on every view change including the initial load post-login.

| Property | Type | Description |
|----------|------|-------------|
| `view_name` | string | `"floor"` \| `"ledger"` \| `"feed"` |
| `navigation_source` | string | `"tab_bar"` \| `"nav_rail"` \| `"deep_link"` \| `"post_login_redirect"` \| `"agent_panel_link"` |
| `previous_view` | string \| null | Previous view name, or `null` if first navigation |
| `time_on_previous_view_seconds` | number \| null | Seconds spent on the previous view. `null` on first navigation. |

---

### 2.3 Agent Card Clicks and Panel Opens

#### `agent_card_clicked`
**Trigger:** User taps or clicks an AgentCard on The Floor.

| Property | Type | Description |
|----------|------|-------------|
| `agent_id` | string | Stable identifier for the agent (e.g. `"clawdia"`, `"sienna"`) |
| `agent_status` | string | Status shown on card at time of click: `"active"` \| `"running"` \| `"idle"` \| `"error"` \| `"unknown"` |
| `card_position` | number | 1-indexed position of the card in the grid (left-to-right, top-to-bottom) |

---

#### `agent_panel_opened`
**Trigger:** Agent Detail Panel finishes loading and is visible to the user (after data fetch resolves).

| Property | Type | Description |
|----------|------|-------------|
| `agent_id` | string | Agent identifier |
| `panel_load_time_ms` | number | Time in ms from card click to panel content rendered |
| `panel_variant` | string | `"sheet"` (mobile) \| `"drawer"` (desktop) |

---

#### `agent_panel_closed`
**Trigger:** User dismisses the Agent Detail Panel.

| Property | Type | Description |
|----------|------|-------------|
| `agent_id` | string | Agent identifier |
| `close_method` | string | `"close_button"` \| `"backdrop_tap"` \| `"swipe_down"` \| `"escape_key"` |
| `time_open_seconds` | number | Seconds the panel was open before dismissal |
| `history_link_clicked` | boolean | Whether the user clicked "View full history" before closing |

---

#### `agent_history_link_clicked`
**Trigger:** User taps "View full history" inside the Agent Detail Panel, navigating to `/feed?agent=[id]`.

| Property | Type | Description |
|----------|------|-------------|
| `agent_id` | string | Agent identifier |
| `source` | string | Always `"agent_panel"` — for future extensibility |

---

### 2.4 Budget Alert Views and Dismissals

#### `budget_alert_viewed`
**Trigger:** The BudgetAlertBanner becomes visible — either on initial Ledger load when threshold is exceeded, or when the 60-second poll crosses a new threshold during a session.

| Property | Type | Description |
|----------|------|-------------|
| `alert_level` | string | `"amber"` (≥$400) \| `"red"` (≥$475) \| `"critical"` (≥$500) |
| `monthly_spend_usd` | number | Current monthly spend in USD at time of alert (rounded to 2dp) |
| `budget_cap_usd` | number | Budget cap value. Always `500` currently — included for future flexibility |
| `trigger` | string | `"page_load"` \| `"poll_threshold_crossed"` |

---

#### `budget_alert_dismissed`
**Trigger:** User taps the × button on the BudgetAlertBanner.

| Property | Type | Description |
|----------|------|-------------|
| `alert_level` | string | `"amber"` \| `"red"` \| `"critical"` |
| `monthly_spend_usd` | number | Spend at time of dismissal |
| `time_visible_seconds` | number | How long the banner was visible before dismissal |

---

### 2.5 Feed Filter Usage

#### `feed_filter_applied`
**Trigger:** User selects an agent filter chip on The Feed (any chip other than "All agents").

| Property | Type | Description |
|----------|------|-------------|
| `agent_id` | string | Agent identifier of the selected filter |
| `filter_source` | string | `"chip_tap"` \| `"deep_link"` (arrived via `/feed?agent=`) |
| `entries_returned` | number | Number of feed entries visible after filter applied |

---

#### `feed_filter_cleared`
**Trigger:** User taps the "All agents" chip to clear an active filter.

| Property | Type | Description |
|----------|------|-------------|
| `previous_agent_id` | string | The agent filter that was active before clearing |
| `entries_returned` | number | Number of feed entries visible after clearing |

---

### 2.6 Error Encounters

#### `error_encountered`
**Trigger:** Any user-visible error state renders — API failures, fetch errors on agent panel, ledger data unavailable, feed load failure, login network error.

| Property | Type | Description |
|----------|------|-------------|
| `error_type` | string | See error type taxonomy below |
| `error_code` | string \| null | HTTP status code if applicable (e.g. `"503"`, `"401"`) — as a string |
| `affected_component` | string | Component that surfaced the error (see taxonomy below) |
| `view_name` | string | Which view the user was on: `"floor"` \| `"ledger"` \| `"feed"` \| `"login"` \| `"agent_panel"` |
| `retry_available` | boolean | Whether a retry button was shown to the user |

**Error type taxonomy (`error_type` values):**

| Value | Description |
|-------|-------------|
| `"api_unreachable"` | Backend API did not respond |
| `"auth_failed"` | Authentication error on a protected endpoint |
| `"data_fetch_failed"` | Data endpoint returned error status |
| `"agent_data_unavailable"` | Specific agent detail fetch failed |
| `"sparkline_unavailable"` | Sparkline chart data could not be loaded |
| `"cost_data_stale"` | Cost data could not refresh — serving cache |
| `"poll_failed"` | 60-second background poll returned an error |
| `"unknown"` | Unclassified error — use sparingly |

**Affected component taxonomy (`affected_component` values):**
`"agent_grid"` \| `"agent_card"` \| `"agent_panel"` \| `"ledger_summary"` \| `"ledger_table"` \| `"ledger_sparkline"` \| `"feed_timeline"` \| `"login_form"` \| `"budget_progress_bar"`

---

#### `error_retry_clicked`
**Trigger:** User clicks a retry button after an error state.

| Property | Type | Description |
|----------|------|-------------|
| `error_type` | string | Same taxonomy as `error_encountered` |
| `affected_component` | string | Same taxonomy as `error_encountered` |
| `retry_number` | number | Which retry attempt (1 = first retry) |

---

### 2.7 Session Duration

Session duration is captured on the `session_ended` event (§2.1) via `session_duration_seconds`. Additionally, the backend should track implicit session boundaries for sessions that end without an explicit logout (tab close, token expiry):

#### `session_heartbeat`
**Trigger:** Fired server-side every 5 minutes of active session. "Active" means the 60-second poll is running (user has the tab open).

| Property | Type | Description |
|----------|------|-------------|
| `session_duration_seconds` | number | Total seconds elapsed since `session_started` |
| `current_view` | string | Last view navigated to |

> **Marcus:** Fire this from the backend poll handler — every 5th poll cycle (5 × 60s = 300s). Do not require a frontend call. This handles sessions that end without an explicit logout.

---

## 3. Standard Properties (All Events)

Every event — without exception — must include these properties. These are set once at session initialisation and attached to every outgoing event payload.

```typescript
interface StandardEventProperties {
  user_id: string;        // Stable hashed identifier for the authenticated user.
                          // Harvey is the only user for now — use a fixed hash of
                          // the username, not the password. e.g. SHA-256("harvey") → truncated.
                          // If unauthenticated (login_failed): use "anonymous".
  
  session_id: string;     // UUID v4 generated at session start (post-login).
                          // Persisted in sessionStorage for the lifetime of the tab session.
                          // Cleared on logout or tab close.
  
  timestamp: string;      // ISO 8601 with timezone. e.g. "2026-03-17T18:45:00.000Z"
                          // Always UTC. Client-side: new Date().toISOString()
  
  platform: string;       // "web_desktop" | "web_mobile" | "web_tablet"
                          // Derived from viewport width at session start:
                          //   < 768px  → "web_mobile"
                          //   768–1023px → "web_tablet"
                          //   ≥ 1024px  → "web_desktop"
  
  environment: string;    // "production" | "staging"
                          // Must be injected at build time via VITE_ENVIRONMENT env var.
                          // Never mix staging and production events.
                          // Marcus: filter staging events from any dashboard queries.
}
```

**Event payload structure (full):**

```typescript
interface AnalyticsEvent {
  event_name: string;               // e.g. "agent_card_clicked"
  properties: StandardEventProperties & Record<string, unknown>; // standard + event-specific
}
```

**Endpoint:** `POST /api/analytics/event`
**Auth:** Same session cookie/token as all other API calls — no separate auth.
**Failure handling:** Fire-and-forget. If the analytics endpoint fails, do NOT surface an error to the user and do NOT retry. Log a console warning in development only.

---

## 4. Key Metrics

These are the metrics derived from the events above. Marcus: these are the queries to support. No dashboard UI needed for v1 — structured log output is sufficient. Run queries manually or via a log aggregator.

---

### M-1: Daily Active Users (DAU)
**Definition:** Count of distinct `user_id` values with at least one `session_started` event on a calendar day (UTC).

**Query signal:** `session_started` events, grouped by `date(timestamp)`, count distinct `user_id`.

**Target:** For an internal single-user tool, DAU = 1 is healthy. If DAU = 0 for 3+ consecutive days, the dashboard may be broken or abandoned.

---

### M-2: Most-Viewed Agents
**Definition:** Count of `agent_panel_opened` events by `agent_id`, over a rolling 7-day window.

**Query signal:** `agent_panel_opened`, group by `agent_id`, count, sorted descending.

**Use:** Identifies which agents Harvey monitors most closely. If error-state agents dominate, that's a reliability signal.

---

### M-3: Most Common Errors
**Definition:** Count of `error_encountered` events by `error_type` and `affected_component`, over a rolling 7-day window.

**Query signal:** `error_encountered`, group by `error_type`, `affected_component`, count, sorted descending.

**Use:** Drives bug prioritisation. Top error = P0 investigation.

---

### M-4: Session Length
**Definition:** Median and p95 `session_duration_seconds` from `session_ended` events, per day.

**Query signal:** `session_ended.session_duration_seconds`, calculate median and p95, grouped by day.

**Benchmarks:**
- <30 seconds: session likely bounced due to error or stale data
- 1–5 minutes: healthy operational check-in
- >10 minutes: possible confusion or extended investigation

---

### M-5: Budget Alert Frequency
**Definition:** Count of `budget_alert_viewed` events by `alert_level`, per calendar month.

**Query signal:** `budget_alert_viewed`, group by `alert_level`, `month(timestamp)`, count.

**Use:** If Harvey sees `amber` or higher alerts consistently in a month, SCC is consistently approaching the budget cap — that's an ops signal to investigate agent cost efficiency, not just a dashboard metric.

---

## 5. Privacy Rules

These rules are absolute. No exceptions. No "just this once".

### What Must NEVER Appear in Analytics Events

| Category | Examples | Rule |
|----------|---------|------|
| **Credentials** | Passwords, session tokens, JWT values, API keys | Never log. Not even partial values or lengths. |
| **Raw token values** | Anthropic API keys, Google Cloud credentials, OpenClaw auth tokens | Never log. Reference by name/type only if needed (e.g. `"credential_type": "anthropic_api_key"`). |
| **PII — personal identifiers** | Full names, email addresses | Never log. Use `user_id` (hashed) only. |
| **IP addresses** | Client IP, server IP in user context | Never log in analytics events. (System logs may capture these separately under different retention rules.) |
| **Agent task content** | The actual text content of what an agent is doing | Never log verbatim task content in analytics. `agent_status` labels only. |
| **Cost raw data at granular level** | Per-API-call token counts, raw billing responses | Use aggregated spend figures only (rounded to 2dp in USD). |
| **Error message text** | Raw exception messages, stack traces | Use `error_type` and `error_code` only. Stack traces go to server error logs, not analytics events. |

### `user_id` Implementation

Since this is a single-user internal tool, the `user_id` is not truly anonymising an unknown population — but we follow the same rules for forward compatibility and good hygiene.

**Implementation:**
```typescript
// On session start, after successful auth:
const USER_ID = "usr_" + sha256("harvey").substring(0, 12);
// Result: a stable, non-reversible identifier. Not "harvey". Not the password.
```

Do not use the password, any part of the auth token, or a raw username as `user_id`.

### Staging Firewall

All events from `environment: "staging"` must be filterable from any reporting query. They should be logged (useful for QA verification), but never mixed into production metric calculations.

---

## 6. Implementation Notes for Sienna

This section is the handoff. For each component, the exact event(s) to fire, when to fire them, and the complete property payload.

> **General pattern:** Create a thin `analytics.ts` utility module. Export a single `track(eventName, properties)` function that appends standard properties and POSTs to `/api/analytics/event`. Import and call it directly from components. No global event listeners. No automatic page-view tracking.

---

### 6.1 `analytics.ts` — Utility Module

```typescript
// src/lib/analytics.ts

const SESSION_ID_KEY = "scc_session_id";

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

function getPlatform(): "web_desktop" | "web_tablet" | "web_mobile" {
  const w = window.innerWidth;
  if (w >= 1024) return "web_desktop";
  if (w >= 768) return "web_tablet";
  return "web_mobile";
}

export function track(eventName: string, properties: Record<string, unknown> = {}): void {
  const payload = {
    event_name: eventName,
    properties: {
      user_id: sessionStorage.getItem("scc_user_id") ?? "anonymous",
      session_id: getSessionId(),
      timestamp: new Date().toISOString(),
      platform: getPlatform(),
      environment: import.meta.env.VITE_ENVIRONMENT ?? "staging",
      ...properties,
    },
  };

  fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    if (import.meta.env.DEV) console.warn("[analytics] Event delivery failed:", eventName);
  });
}
```

Set `scc_user_id` in `sessionStorage` immediately after successful login (before redirect). Clear it on logout.

---

### 6.2 Login View (`/login`)

**Component:** `LoginForm`

| Event | When to fire | Additional properties |
|-------|-------------|----------------------|
| `session_started` | Inside the login success handler, before redirect | `redirect_target`: read from URL param `?redirect=` or default to `"/"`. `auth_latency_ms`: time from submit click to this line. |
| `login_failed` | Inside the login error handler | `failure_reason`: map API error to `"wrong_password"` \| `"network_error"` \| `"account_locked"`. `attempt_number`: tracked in component state (increment on each failure, reset on success or page reload). |

**Note:** Do not track the password field value, length, or any derivative at any point.

---

### 6.3 Logout Button (`AppShell` nav)

**Component:** `AppShell` (logout button handler)

| Event | When to fire | Additional properties |
|-------|-------------|----------------------|
| `session_ended` | On logout button click, before clearing session storage | `initiated_by: "user"`. `session_duration_seconds`: calculate from login timestamp stored in sessionStorage. `views_visited`: array tracked in sessionStorage — push each new view name on `view_navigated` events. |

Clear `scc_user_id`, `scc_session_id`, and `scc_session_start` from sessionStorage after firing the event.

---

### 6.4 Navigation (`AppShell` tab bar / nav rail)

**Component:** `AppShell` — navigation click handlers

| Event | When to fire | Additional properties |
|-------|-------------|----------------------|
| `view_navigated` | On every route change (including initial post-login redirect) | `view_name`: `"floor"` \| `"ledger"` \| `"feed"`. `navigation_source`: `"tab_bar"` (mobile), `"nav_rail"` (desktop), `"deep_link"` (direct URL), `"post_login_redirect"` (first nav after login), `"agent_panel_link"` (from panel "View full history"). `previous_view`: previous route name from router state. `time_on_previous_view_seconds`: tracked via timestamp stored on each navigation. |

Use React Router's `useLocation` hook or an equivalent route-change effect. Fire once per navigation, not on re-renders.

---

### 6.5 Agent Cards (`AgentGrid` / `AgentCard`)

**Component:** `AgentCard` — `onClick` handler

| Event | When to fire | Additional properties |
|-------|-------------|----------------------|
| `agent_card_clicked` | On card click/tap, immediately | `agent_id`, `agent_status` (current badge status), `card_position` (1-indexed position in the rendered grid — track this as a prop passed from `AgentGrid`). |

---

### 6.6 Agent Detail Panel (`AgentDetailPanel`)

**Component:** `AgentDetailPanel`

| Event | When to fire | Additional properties |
|-------|-------------|----------------------|
| `agent_panel_opened` | When panel content has loaded and is visible (after fetch resolves) | `agent_id`, `panel_load_time_ms` (from card click timestamp to now), `panel_variant`: `"sheet"` \| `"drawer"` based on viewport. |
| `agent_panel_closed` | On panel close, regardless of method | `agent_id`, `close_method`, `time_open_seconds` (from panel open timestamp to now), `history_link_clicked: boolean`. |
| `agent_history_link_clicked` | On "View full history" link click | `agent_id`, `source: "agent_panel"`. Set `history_link_clicked: true` in local state so `agent_panel_closed` can read it. |

Store panel open timestamp and agent_id in component state on open. Clear on close after events are fired.

---

### 6.7 Budget Alert Banner (`BudgetAlertBanner`)

**Component:** `BudgetAlertBanner`

| Event | When to fire | Additional properties |
|-------|-------------|----------------------|
| `budget_alert_viewed` | When the banner becomes visible (mount with `useEffect`) | `alert_level`, `monthly_spend_usd`, `budget_cap_usd: 500`, `trigger`: `"page_load"` if banner is visible on Ledger mount; `"poll_threshold_crossed"` if a poll cycle caused a new threshold to be hit mid-session. |
| `budget_alert_dismissed` | On × button click | `alert_level`, `monthly_spend_usd`, `time_visible_seconds` (from mount timestamp to now). |

**Deduplication:** Only fire `budget_alert_viewed` once per unique `alert_level` per session. If the banner is already showing amber and the spend moves to red, fire `budget_alert_viewed` again with `alert_level: "red"`. Use a `Set` in sessionStorage to track which levels have been reported.

---

### 6.8 Feed Filter Chips (`AgentFilterChip` row in Feed)

**Component:** `FeedFilterBar` (or wherever filter state is managed)

| Event | When to fire | Additional properties |
|-------|-------------|----------------------|
| `feed_filter_applied` | On agent chip selection | `agent_id`, `filter_source`: `"chip_tap"` or `"deep_link"` (if chip is auto-selected on mount from URL param), `entries_returned`: count of visible entries after filter. |
| `feed_filter_cleared` | On "All agents" chip selection | `previous_agent_id`, `entries_returned`: count after clearing. |

Do not fire `feed_filter_applied` on initial mount with no filter active (no-op state). Only fire on user-initiated or deep-link-initiated filter changes.

---

### 6.9 Error States (All Components)

**Pattern:** Call `track("error_encountered", {...})` inside each component's error handling block or error boundary. Do not create a global error listener — each component fires its own event with the correct `affected_component` value.

| Component | `affected_component` value |
|-----------|--------------------------|
| `AgentGrid` (full grid failure) | `"agent_grid"` |
| `AgentCard` (individual card error) | `"agent_card"` |
| `AgentDetailPanel` (fetch failure) | `"agent_panel"` |
| `SpendSummaryRow` | `"ledger_summary"` |
| `AgentCostTable` | `"ledger_table"` |
| `SparklineChart` | `"ledger_sparkline"` |
| `BudgetProgressBar` | `"budget_progress_bar"` |
| `FeedTimeline` | `"feed_timeline"` |
| `LoginForm` (network error) | `"login_form"` |

| Event | When to fire | Additional properties |
|-------|-------------|----------------------|
| `error_encountered` | When an error state renders to the user | `error_type`, `error_code` (HTTP status as string, or `null`), `affected_component`, `view_name`, `retry_available: boolean`. |
| `error_retry_clicked` | On retry button click | `error_type`, `affected_component`, `retry_number` (tracked in component state). |

---

### 6.10 What NOT to Instrument

To keep this lightweight and the log volume low, the following are explicitly out of scope for v1:

- Individual field interactions (focus, blur on password field)
- Scroll depth on The Feed
- Hover events
- Sort column clicks on The Ledger (low value for a single-user tool)
- Sparkline interactions
- "Last updated" indicator clicks / refresh icon
- Window resize / orientation change
- Tab visibility changes (background/foreground)

If any of these become relevant later (e.g. Harvey reports he's confused by the sort behaviour), we add the event then. Not before.

---

*End of Analytics Tracking Plan v1.0*

*Phoebe — SCC Dev Team*
*Questions on event spec? Come to me before you build it wrong. Data quality issues after deploy = same-day fix.*
