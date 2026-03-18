# SCC Office Dashboard — UX Specification
**Codename:** The Office
**Spec Author:** Imogen (Senior UX Designer, SCC Dev Team)
**Version:** 1.0
**Date:** 2026-03-17
**Status:** Ready for handoff to Sienna (frontend) and Cass (copy)

---

> **To Sienna:** This spec is your single source of truth. Every state, every component, every interaction is defined here. If something is unclear, come to me directly — same day. Do not guess.
>
> **To Cass:** All copy placeholders are marked `[COPY: description]`. These are yours. Every label, message, and microcopy string that requires editorial judgment is flagged. Please fill them in before Sienna implements.

---

## Table of Contents

1. [Design Philosophy & Rationale](#1-design-philosophy--rationale)
2. [Information Architecture](#2-information-architecture)
3. [Navigation Model](#3-navigation-model)
4. [Complete User Flows](#4-complete-user-flows)
   - 4.1 Login
   - 4.2 Viewing The Floor
   - 4.3 Clicking an Agent Card
   - 4.4 Viewing The Ledger
   - 4.5 Viewing The Feed
   - 4.6 Receiving a Budget Alert
5. [View States — Complete Specification](#5-view-states--complete-specification)
   - 5.1 Login
   - 5.2 The Floor
   - 5.3 Agent Detail Panel
   - 5.4 The Ledger
   - 5.5 The Feed
6. [Component Library](#6-component-library)
7. [Apple HIG Compliance](#7-apple-hig-compliance)
8. [Responsive Behaviour](#8-responsive-behaviour)
9. [Accessibility Requirements](#9-accessibility-requirements)
10. [Acceptance Criteria](#10-acceptance-criteria)
11. [Open Questions](#11-open-questions)

---

## 1. Design Philosophy & Rationale

### Who Uses This

**Primary user:** Harvey Bremner (COO, SCC). One user. Desktop-primary, but checks on mobile when away from desk.

**User goals (in order of frequency):**
1. Quick scan: are all agents running? Is anything broken?
2. Cost check: where are we against the monthly budget?
3. Audit: what has happened today / this week?

**Mental model:** Harvey thinks of this like an office CCTV + ledger system. He can see who's at their desk (The Floor), check the books (The Ledger), and review the day's log (The Feed). This metaphor should be reinforced in the design.

### Design Rationale

The primary constraint is *trust at a glance*. Harvey needs to open this dashboard and know within 3 seconds whether anything needs his attention. This drives every layout decision:

- Status is visual first (colour + shape), text second.
- Alerts surface immediately — never buried.
- Navigation is flat. Three views. One click from anywhere.
- No decorative elements. Every pixel serves information.

---

## 2. Information Architecture

```
SCC Office Dashboard
│
├── /login
│   └── Password form → authenticates → redirects to /
│
├── / (The Floor) [DEFAULT]
│   └── [Agent Card] × N
│       └── Agent Detail Panel (modal/sheet)
│
├── /ledger (The Ledger)
│   ├── Budget summary bar
│   ├── Provider breakdown
│   └── Per-agent cost table
│
└── /feed (The Feed)
    ├── Timeline (all agents)
    └── Filtered timeline (per agent)
```

**Navigation depth:** Maximum 2 levels (main view → agent detail). No breadcrumbs required.

**Default view:** The Floor (`/`). This is the highest-value, most-frequently consulted view.

**View labels:**
- 🏢 The Floor
- 💰 The Ledger
- 📋 The Feed

These are the canonical names throughout the product. Do not use alternatives like "Home", "Costs", or "Log".

---

## 3. Navigation Model

### Tab Bar (Mobile / Tablet)

Bottom tab bar with three items. Follows Apple tab bar pattern.

| Position | Label | Icon | Route |
|----------|-------|------|-------|
| Left | The Floor | `building.2` (SF Symbol) | `/` |
| Centre | The Ledger | `dollarsign.circle` (SF Symbol) | `/ledger` |
| Right | The Feed | `list.bullet.rectangle` (SF Symbol) | `/feed` |

- Active tab: uses accent colour (see §7 colour tokens), filled icon variant
- Inactive tab: system grey, outline icon variant
- Tab bar is always visible after login; it never hides

### Sidebar / Top Nav (Desktop ≥ 1024px)

Left-side navigation rail. 64px wide icon-only, or 220px wide with labels. Collapses to icon-only at intermediate breakpoints (1024px–1200px).

Contains:
- SCC logo / wordmark at top
- Three nav items (same labels/icons as mobile tab bar)
- Budget status indicator at bottom — persistent mini badge showing current spend vs. $500 limit
- Logout button at very bottom (icon + label on expanded, icon-only on collapsed)

### Active State Persistence

The last-visited view is remembered in `sessionStorage`. On returning to the app (same tab, within session), the user lands on their last view, not necessarily The Floor. On fresh load / new session, default to The Floor.

---

## 4. Complete User Flows

### 4.1 Login Flow

**Entry point:** User navigates to the app URL (any route) without an active session.
**Goal:** Authenticate and reach The Floor.

**Precondition:** No active session cookie / token.

**Happy Path:**
```
1. App loads → detects no auth → redirects to /login
2. User sees: SCC logo, password field, "Sign In" button
3. User enters password → taps/clicks "Sign In"
4. [Loading state: button shows spinner, field disabled]
5. Auth succeeds → redirect to / (The Floor)
```

**Alternative Path — Returning to Specific Route:**
```
1. User navigates directly to /ledger without auth
2. Redirect to /login?redirect=/ledger
3. Successful login → redirect to /ledger (not /)
```

**Error States:**

| Error | Trigger | Response |
|-------|---------|----------|
| Wrong password | Incorrect entry | Inline error below field. Field outline turns red. Focus returns to field. |
| Network error | API unreachable | Error message below button. Button re-enabled. |
| Too many attempts | 5+ failed attempts | [COPY: lockout message and duration] — consider 15-minute lockout. Show countdown if locked. |

**Empty State:** N/A — login has no empty state.

**Loading State:** Button shows inline spinner. Password field and button disabled. Duration: typically <500ms. If >3s, show [COPY: slow connection message].

**Success State:** Smooth transition to The Floor. No explicit "success" message — the destination IS the success.

**Exit Point:** The Floor (or redirect target).

---

### 4.2 Viewing The Floor

**Entry point:** Successful login, or tapping/clicking "The Floor" nav item.
**Goal:** Assess agent status at a glance; identify any issues.

**Happy Path:**
```
1. User navigates to The Floor
2. [Loading state: skeleton cards render in grid]
3. Agent cards populate — each showing name, emoji, status badge, current task, last seen
4. User scans the grid
5. Processing agents pulse visually
6. User satisfied → no further action needed
```

**Alternative Path — Identifying a Problem:**
```
1. User sees an agent card in "Error" state (red badge)
2. User clicks the card → Agent Detail Panel opens
3. User reads the error summary
4. User closes panel → returns to grid
```

**Alternative Path — Forced Refresh:**
```
1. User suspects stale data
2. User pulls to refresh (mobile) or clicks refresh icon (desktop)
3. Grid re-polls → data refreshes
```

**Auto-Refresh:** The grid polls every 60 seconds automatically. A subtle last-updated timestamp in the top-right corner shows when data was last fetched.

---

### 4.3 Clicking an Agent Card

**Entry point:** User taps/clicks an agent card on The Floor.
**Goal:** See a plain-English summary of what this agent is doing / has been doing.

**Happy Path:**
```
1. User taps agent card
2. [Loading state: panel/modal opens with spinner]
3. Agent Detail Panel populates:
   - Agent name + emoji (large)
   - Status badge
   - Current task (plain English, expanded)
   - Last 3–5 activity entries (from The Feed, filtered to this agent)
   - Last seen timestamp
   - Cost today (from The Ledger, filtered to this agent)
4. User reads the summary
5. User taps "View full history" → navigates to /feed filtered to this agent (optional deep link)
6. User dismisses panel (tap outside / close button / swipe down on mobile)
```

**Mobile:** Full-screen sheet slides up from bottom (Apple sheet pattern).
**Desktop:** Slide-in panel from the right side of the grid (400px wide), grid content narrows.

**Error State:** If agent data can't be fetched, show [COPY: agent detail error message] with a retry button.

**Loading State:** Spinner centred in panel; background panel shell visible immediately so the transition feels instant.

**Empty State (Idle agent with no recent activity):** Show agent info but replace activity list with [COPY: idle agent empty state message].

**Exit Points:**
- Dismiss panel → back to The Floor
- "View full history" link → /feed?agent=[agentId]

---

### 4.4 Viewing The Ledger

**Entry point:** Tapping/clicking "The Ledger" nav item.
**Goal:** Understand current spend, trend, and budget position.

**Happy Path:**
```
1. User navigates to The Ledger
2. [Loading state: skeleton loaders for all sections]
3. View populates:
   a. Budget status bar (today / week / month / all-time totals)
   b. Budget progress bar — current month spend vs. $500 cap
   c. Amber/red warning if thresholds exceeded
   d. Provider breakdown (Anthropic, Google, etc.)
   e. Per-agent cost table (sortable by: name, today, week, month)
   f. Hourly sparkline charts per provider
4. User reviews figures
5. User sorts agent table by "This Month" (descending) to find biggest spenders
```

**Alternative Path — Budget Warning Active:**
```
1. User opens The Ledger
2. Budget progress bar is amber (≥$400) or red (≥$475)
3. Warning banner visible at top of view
4. User sees which agents are driving spend
```

**Error State:** If cost API is unreachable, show [COPY: ledger data unavailable message] with last-known figures (if cached) and timestamp of last successful fetch. Do not show stale data as current without clearly labelling it "Last updated [time]".

**Loading State:** Skeleton loaders matching the layout of the populated view. Do not show 0s or blank charts — show grey skeleton shapes.

**Empty State (new install, no data):** Show all totals as $0.00. Sparklines show flat empty state. [COPY: empty ledger message — "No spending recorded yet" equivalent].

---

### 4.5 Viewing The Feed

**Entry point:** Tapping/clicking "The Feed" nav item. Also reachable via "View full history" link from an Agent Detail Panel.
**Goal:** Review what agents have done today; audit a specific agent's activity.

**Happy Path:**
```
1. User navigates to The Feed
2. [Loading state: skeleton timeline entries]
3. Feed populates:
   - Chronological list of activity entries (newest first)
   - Each entry: agent emoji + name, timestamp, plain-English action summary
4. User reads the timeline
```

**Alternative Path — Filtering by Agent:**
```
1. Feed loads (all agents)
2. User taps agent filter chip (or arrives via /feed?agent=[id])
3. Feed re-filters to show only that agent's entries
4. Selected filter chip is highlighted
5. User taps "All agents" chip to clear filter
```

**Alternative Path — Arriving via Deep Link:**
```
1. User taps "View full history" on Agent Detail Panel
2. Feed opens pre-filtered to that agent
3. Filter chip for that agent is pre-selected
```

**Error State:** [COPY: feed error message] + retry button. If partial data loads, show what loaded and surface an error for the missing period.

**Loading State:** 3–5 skeleton rows matching entry height.

**Empty State (no activity today):** [COPY: empty feed message — "No activity recorded yet today" equivalent]. If filtered to a specific agent with no activity: [COPY: per-agent empty state].

---

### 4.6 Receiving a Budget Alert

**Context:** This flow is partially out-of-app (Telegram), but the in-app response must be designed.

**Trigger Conditions:**
- Monthly spend reaches $400 → Amber alert
- Monthly spend reaches $475 → Red alert (no Telegram message at this level per brief — confirm with Harvey)
- Monthly spend reaches $500 → Critical alert + Telegram message

> **Note to Harvey / Cass:** The brief mentions Telegram alerts at $400 and $500. The $475 threshold is red in-app only. Please confirm whether Telegram alerts fire at all three thresholds or just $400 and $500.

**Flow A — User is in the app when threshold is crossed:**
```
1. 60-second poll detects threshold has been crossed
2. Alert banner appears at top of The Ledger (persists until dismissed or spend drops)
3. If user is on The Floor or Feed, the budget status indicator in the nav shows amber/red colouring
4. On next navigation to The Ledger, full warning banner is visible
```

**Flow B — User receives Telegram notification (out-of-app):**
```
1. Harvey receives Telegram message: [COPY: $400 alert message] or [COPY: $500 alert message]
2. Harvey taps link in message → opens The Office in browser
3. If not authenticated → redirected to /login (with redirect to /ledger)
4. After login → lands on /ledger, warning banner visible
```

**In-App Alert States:**

| Spend Level | Banner Colour | Icon | Nav Indicator |
|-------------|---------------|------|---------------|
| < $400 | None | None | None |
| $400–$474 | Amber (warning) | ⚠️ | Amber dot on Ledger nav |
| $475–$499 | Red (danger) | 🔴 | Red dot on Ledger nav |
| ≥ $500 | Critical red | 🚨 | Pulsing red dot on Ledger nav |

**Dismissal:** Warning banners can be dismissed per-session (tapping ×). They reappear on next app load as long as threshold is still exceeded.

---

## 5. View States — Complete Specification

### 5.1 Login View

**Route:** `/login`
**Layout:** Centred card, vertically and horizontally centred on viewport.

#### Layout Structure
```
[Viewport — full screen, light grey bg]
  └── [Login Card — white, rounded-2xl, shadow-md, max-width 400px]
        ├── [SCC Logo / Wordmark]
        ├── [App title: "The Office"] ← [COPY: confirm preferred subtitle/tagline]
        ├── [Password field]
        │     ├── Label: [COPY: password field label]
        │     └── Show/hide password toggle
        ├── [Sign In Button — full width, primary]
        └── [Error message area — below button]
```

**States:**

| State | Description |
|-------|-------------|
| Default | Form ready, field empty, button enabled |
| Focused | Field has focus ring (system blue) |
| Filled | Field contains text, button active |
| Loading | Button shows spinner, all inputs disabled |
| Error — wrong password | Field border red, [COPY: error message] below field, button re-enabled, field value cleared |
| Error — network | [COPY: network error message] below button |
| Error — locked | [COPY: lockout message] — entire form disabled, countdown timer visible |
| Success | Smooth fade/crossfade transition to The Floor |

---

### 5.2 The Floor

**Route:** `/` (index)
**Layout:** Responsive grid of agent cards + navigation.

#### Layout Structure
```
[Page]
  ├── [Nav Bar / Tab Bar]
  ├── [Page Header]
  │     ├── Title: "The Floor"
  │     ├── [Agent count: "14 agents" — updates dynamically]
  │     └── [Last updated: "Updated 23s ago" — live counter]
  └── [Agent Grid]
        └── [Agent Card] × N
```

**Agent Grid Layout:**
- Mobile (375px–767px): 1 column
- Tablet (768px–1023px): 2 columns
- Desktop (1024px–1439px): 3 columns
- Wide desktop (≥1440px): 4 columns

**States:**

| State | Description |
|-------|-------------|
| Loading | Grid shows N skeleton cards (14 by default — matches roster count) |
| Populated | All agent cards rendered with live data |
| Partial Error | Cards that failed to load show error card variant (see §6 Agent Card component) |
| Full Error | Grid area replaced by error state — [COPY: floor error message] + retry button |
| Empty | Should not occur (roster is fixed). If it does: [COPY: empty floor message] |
| Stale Data | If poll fails, last-known data remains visible with "⚠️ Data may be outdated — [COPY: stale data suffix]" banner |

---

### 5.3 Agent Detail Panel

**Trigger:** Tap/click on any Agent Card.
**Layout — Mobile:** Full-screen bottom sheet (slides up, drag to dismiss)
**Layout — Desktop:** Slide-in panel from right edge, 400px wide, grid shifts left

#### Layout Structure
```
[Panel]
  ├── [Drag handle (mobile only)]
  ├── [Close button (top right)]
  ├── [Agent Header]
  │     ├── [Agent Emoji — large, 48px]
  │     ├── [Agent Name — title]
  │     └── [Status Badge]
  ├── [Current Task]
  │     ├── Section label: "Currently" or "Last task"
  │     └── [Task description — plain English]
  ├── [Stats Row]
  │     ├── Last seen: [timestamp]
  │     └── Spend today: $[amount]
  ├── [Recent Activity]
  │     ├── Section label: "Recent activity"
  │     └── [Mini Feed Entry] × 3–5
  └── [Footer]
        └── [View full history] link → /feed?agent=[id]
```

**States:**

| State | Description |
|-------|-------------|
| Loading | Spinner centred in panel, panel shell visible |
| Populated — Active | Full content visible, current task shows live activity |
| Populated — Idle | Task shows [COPY: idle agent task placeholder], activity list shows last known entries |
| Populated — Error (agent) | Status badge is red, error description in task area, [COPY: agent error explanation] |
| Error (fetch failed) | [COPY: panel fetch error] + retry button |
| Empty activity | Activity section shows [COPY: no recent activity message] |

---

### 5.4 The Ledger

**Route:** `/ledger`
**Layout:** Single-column on mobile; two-column (summary + table) on desktop ≥ 1024px.

#### Layout Structure
```
[Page]
  ├── [Nav]
  ├── [Page Header: "The Ledger"]
  ├── [Budget Alert Banner] — CONDITIONAL, amber or red
  ├── [Spend Summary Row]
  │     ├── Today: $[amount]
  │     ├── This week: $[amount]
  │     ├── This month: $[amount]
  │     └── All time: $[amount]
  ├── [Budget Progress Bar]
  │     ├── Label: "[COPY: budget progress label — e.g. 'Monthly budget']"
  │     ├── Progress: $[spent] of $500
  │     ├── Visual fill bar (green → amber → red)
  │     └── Percentage label
  ├── [Provider Breakdown]
  │     ├── Section header: "By provider"
  │     └── [Provider Row] × N (Anthropic, Google, + future)
  │           ├── Provider name + icon
  │           ├── Spend this month
  │           └── [Sparkline chart — hourly, last 24h]
  └── [Agent Cost Table]
        ├── Section header: "By agent"
        ├── [Sort controls: Name | Today | This week | This month]
        └── [Agent Cost Row] × 14
              ├── Agent emoji + name
              ├── Today: $[amount]
              ├── This week: $[amount]
              └── This month: $[amount]
```

**States:**

| State | Description |
|-------|-------------|
| Loading | Skeleton loaders for all sections. No placeholder numbers. |
| Populated — under budget | No alert banner. Progress bar green/neutral. |
| Populated — amber warning | Amber alert banner. Progress bar amber. Nav indicator amber. |
| Populated — red warning | Red alert banner. Progress bar red. Nav indicator red. |
| Populated — critical | Critical red banner. Pulsing indicator. [COPY: critical budget message] |
| Error | [COPY: ledger error message]. If cached data exists: show with "Last updated [time]" label. |
| Empty (no spend) | All values $0.00. Sparklines empty. [COPY: empty ledger message]. |
| Stale data | Subtle warning label on each figure: "As of [time]". Full banner only if >1 hour stale. |

**Budget Progress Bar Colour Logic:**
- 0–79% ($0–$399): Green (`system-green` / `#34C759`)
- 80–94% ($400–$474): Amber (`system-orange` / `#FF9500`)
- 95–99% ($475–$499): Red (`system-red` / `#FF3B30`)
- 100%+ (≥$500): Critical red, pulsing animation

---

### 5.5 The Feed

**Route:** `/feed`
**Layout:** Single-column timeline, filter chips above.

#### Layout Structure
```
[Page]
  ├── [Nav]
  ├── [Page Header: "The Feed"]
  │     └── [Date label: "Today, [COPY: date format]"]
  ├── [Filter Bar]
  │     ├── [Chip: "All agents"] ← default selected
  │     └── [Chip: agent name] × 14 — horizontally scrollable
  └── [Timeline]
        └── [Feed Entry] × N (newest first)
              ├── [Agent Emoji — 32px]
              ├── [Entry Body]
              │     ├── Agent name
              │     ├── Timestamp (relative: "3 mins ago"; absolute on hover/tap: "14:23:07")
              │     └── Action summary (plain English)
              └── [Timeline connector line]
```

**States:**

| State | Filter | Description |
|-------|--------|-------------|
| Loading | Any | 3–5 skeleton rows |
| Populated — all agents | All | Full timeline, all entries |
| Populated — filtered | Single agent | Only that agent's entries. Filter chip highlighted. |
| Empty — all agents | All | [COPY: empty feed all agents message] |
| Empty — filtered | Single agent | [COPY: empty feed single agent message] with agent name |
| Error | Any | [COPY: feed error message] + retry button |
| Partial load | All | Entries that loaded shown; error notice for the affected period |

---

## 6. Component Library

This section defines every UI component required. Sienna: for each component, check the existing design system before building new. Where existing components apply, they are noted.

---

### 6.1 AppShell

**What it does:** The persistent outer wrapper — navigation + content area.

**Variants:**
- `mobile`: Bottom tab bar + full-width content area
- `desktop`: Left navigation rail (icon-only at 1024px, with labels at 1200px+) + content area

**States:**
- Default
- Nav item active (one of three tab/rail items highlighted)
- Budget warning indicator on Ledger nav item (amber/red/pulsing dot)

**Props/Data needs:** Current route (for active state), current budget status (for nav indicator)

**ARIA:** `<nav role="navigation" aria-label="[COPY: main nav aria label]">`. Active tab item: `aria-current="page"`.

---

### 6.2 AgentCard

**What it does:** Displays a single agent's status in the grid. Primary interactive element on The Floor.

**Size:** Full width of grid column. Min-height: 120px on mobile, 140px on desktop.

**Layout:**
```
[Card — white, rounded-2xl, shadow-sm, padding-4]
  ├── [Row: emoji (32px) + agent name (semibold) + status badge (right-aligned)]
  ├── [Current task text — 2 lines max, body/secondary colour]
  └── [Footer row: "Last seen [time]"]
```

**Status Badge variants:**

| Status | Label | Colour | Behaviour |
|--------|-------|--------|-----------|
| Active | [COPY: active label] | Green | Static |
| Running | [COPY: running label] | Blue | Card shows subtle pulse animation on border |
| Idle | [COPY: idle label] | Grey | Static |
| Error | [COPY: error label] | Red | Card border red, no animation |
| Unknown | [COPY: unknown label] | Grey/muted | Static |

**States:**
- Default (any status above)
- Hover (desktop): slight shadow lift, cursor pointer
- Pressed/Active: scale(0.98), shadow reduce
- Loading/Skeleton: grey placeholder matching card layout
- Error variant: red left border accent, error badge

**Animation:** Running state uses `@keyframes pulse` on the card border — a gentle opacity oscillation (0.4s ease-in-out, infinite). Must respect `prefers-reduced-motion: reduce`.

**ARIA:** `role="button"`, `aria-label="[Agent name], [status], [task summary]"`, `tabIndex="0"`. Announce status changes to screen readers.

---

### 6.3 StatusBadge

**What it does:** Pill-shaped badge showing an agent's current status.

**Sizes:** `sm` (on AgentCard), `md` (on Agent Detail Panel)

**Variants:** Active, Running, Idle, Error, Unknown (see status table in §6.2)

**States:** Static (all), Animated (Running — the badge itself does not pulse; the parent AgentCard does)

**ARIA:** `aria-label="Status: [status text]"` — do not rely on colour alone.

---

### 6.4 AgentDetailPanel

**What it does:** Expanded view of a single agent. Opens on card tap.

**Variants:**
- `sheet` (mobile): bottom sheet, drag-to-dismiss, max-height 90vh
- `panel` (desktop): right-side drawer, 400px wide, full viewport height

**States:** Loading, Populated-Active, Populated-Idle, Populated-Error, FetchError (see §5.3)

**Close behaviour:**
- Sheet: drag down >80px OR tap close button OR tap backdrop
- Panel: tap close button (×) at top right OR press Escape key

**Animation:** Sheet: `transform: translateY` from 100% to 0 (300ms ease-out). Panel: `transform: translateX` from 100% to 0 (250ms ease-out). Respect `prefers-reduced-motion`.

**Focus management:** On open, focus moves to first interactive element inside panel (close button). On close, focus returns to the card that triggered the panel.

**ARIA:** `role="dialog"`, `aria-modal="true"`, `aria-label="[Agent name] detail"`. Trap focus within panel while open.

---

### 6.5 BudgetProgressBar

**What it does:** Visual representation of monthly spend vs. $500 budget.

**Layout:**
```
[Label: "Monthly budget"] [Value: "$342 of $500"]
[Progress track — full width]
  └── [Progress fill — coloured based on level]
[Percentage label — right-aligned: "68%"]
```

**States / Colour logic:** As defined in §5.4.

**Animation:** Fill transitions smoothly on data refresh (`transition: width 600ms ease-in-out`). Critical state (≥$500) adds `@keyframes pulse` on the fill colour. Respect `prefers-reduced-motion`.

**ARIA:** `role="progressbar"`, `aria-valuenow="[amount]"`, `aria-valuemin="0"`, `aria-valuemax="500"`, `aria-label="[COPY: budget progress aria label]"`. Value changes should be announced to screen readers (use `aria-live="polite"` on value display).

---

### 6.6 BudgetAlertBanner

**What it does:** Top-of-view warning when spend thresholds are exceeded.

**Variants:** Amber (≥$400), Red (≥$475), Critical (≥$500)

**Layout:**
```
[Banner — full width, sticky below page header]
  ├── [Icon: ⚠️ or 🚨]
  ├── [Message text — [COPY: amber alert message] / [COPY: red alert message] / [COPY: critical alert message]]
  └── [Dismiss button: ×]
```

**States:** Visible (amber/red/critical), Dismissed (hidden — stored in sessionStorage), Not triggered (absent from DOM)

**ARIA:** `role="alert"` when it first appears (announces to screen readers). `aria-live="assertive"` for critical. Dismiss button: `aria-label="[COPY: dismiss alert aria label]"`.

---

### 6.7 SpendSummaryRow

**What it does:** Horizontal row (or 2×2 grid on mobile) of four spend figures.

**Figures:** Today / This Week / This Month / All Time

**States:** Loading (skeleton), Populated, Stale (figures shown with "as of [time]" suffix)

**ARIA:** Wrap each figure in `<dl>` with `<dt>` (label) and `<dd>` (value) pairs.

---

### 6.8 ProviderRow

**What it does:** Single row in the provider breakdown table. Shows provider name, monthly spend, and a sparkline.

**Components used:** SparklineChart (§6.9)

**States:** Loading (skeleton), Populated, Error (sparkline fails to load — show "—" with tooltip [COPY: sparkline unavailable])

---

### 6.9 SparklineChart

**What it does:** Mini 24-hour hourly spend chart per provider. No axes, no labels — context provided by parent.

**Size:** 120px × 40px (desktop), 80px × 32px (mobile)

**States:** Loading (skeleton), Populated (line chart), Empty (flat line with muted colour, not zero-data — zero IS valid data), Error (dashed line with [COPY: chart unavailable tooltip])

**ARIA:** `role="img"`, `aria-label="[Provider name] hourly spend over last 24 hours. [COPY: summary description if possible]"`. Charts are decorative but should have meaningful labels.

**Note to Sienna:** Recharts or a lightweight canvas alternative. Keep the bundle cost in mind — $10–15 total build budget. Prefer a lightweight option.

---

### 6.10 AgentCostTable

**What it does:** Sortable table of per-agent spend across Today / This Week / This Month.

**Layout:** Standard table with sticky header row on desktop. On mobile, horizontally scrollable (do not collapse to card layout — the comparative reading value is in the table format).

**Sort states:** Default (alphabetical by name), Sorted ascending, Sorted descending. Sort applies to one column at a time. Sort indicator: ↑ / ↓ next to active column header.

**States:** Loading (skeleton rows), Populated, Error (table fails to load — [COPY: table error message])

**ARIA:** `role="table"`. Sortable column headers: `role="columnheader"`, `aria-sort="ascending|descending|none"`. On sort change, announce new sort state: `aria-live="polite"` region outside table.

---

### 6.11 FeedEntry

**What it does:** Single activity entry in The Feed timeline.

**Layout:**
```
[Entry — padding-y-3, border-bottom]
  ├── [Left: emoji (32px) + vertical connector line]
  └── [Right: content]
        ├── [Header row: agent name (semibold) + timestamp]
        └── [Action summary — plain English, body text]
```

**States:** Default, Hover (subtle background tint on desktop), Skeleton (loading)

**Timestamp behaviour:** Shows relative time ("3 mins ago") by default. On hover (desktop) or tap (mobile), shows absolute timestamp ("14:23:07"). Use `title` attribute and `aria-label` to expose full timestamp.

**ARIA:** Each entry: `role="listitem"`. Timestamp: `<time datetime="[ISO8601]">`. The feed list: `role="list"`.

---

### 6.12 AgentFilterChip

**What it does:** Filter control on The Feed. Selects which agent's entries are shown.

**Layout:** Horizontally scrollable chip row. Chip = emoji + name (or "All agents").

**States:** Unselected (default), Selected (filled background, accent colour), Disabled (agent not available)

**Behaviour:** Single-select. Selecting any agent chip deselects others. Selecting "All agents" clears all agent selections.

**ARIA:** `role="tab"` for each chip, `aria-selected="true|false"`, chip row: `role="tablist"` with `aria-label="[COPY: filter chips aria label]"`. Support arrow key navigation between chips (standard tab panel pattern).

---

### 6.13 PasswordField

**What it does:** Password input with show/hide toggle.

**States:** Default, Focused (system blue focus ring), Filled, Error (red border + error message), Disabled

**Toggle:** Eye icon button (show) / Eye-slash icon button (hide). `aria-label="[COPY: show password aria label]"` / `"[COPY: hide password aria label]"`. Does not affect form submission.

**ARIA:** `<label>` element properly associated. `aria-describedby` pointing to error message when in error state. `autocomplete="current-password"`.

---

### 6.14 PrimaryButton

**What it does:** Primary call-to-action button (used in Login, error states, etc.)

**States:** Default, Hover, Pressed, Loading (spinner replaces label), Disabled

**Loading:** Inline spinner SVG replaces text. Button width does not change. `aria-busy="true"` when loading.

---

### 6.15 LastUpdatedIndicator

**What it does:** Small text showing when data was last fetched. Updates each poll cycle.

**Location:** Top-right of The Floor page header and The Ledger page header.

**Format:** "Updated [N]s ago" / "Updated [N]m ago" / "Updated just now" / "⚠️ Update failed"

**ARIA:** `aria-live="polite"`, `aria-atomic="true"`. Announce changes but not too frequently — debounce announcements to once per minute maximum.

---

### 6.16 SkeletonLoader

**What it does:** Placeholder shape shown while content loads. Prevents layout shift.

**Variants:** Card (matches AgentCard dimensions), Row (matches FeedEntry / AgentCostRow), Text (inline text placeholder), Chart (matches SparklineChart dimensions)

**Animation:** Shimmer effect (`@keyframes shimmer` — gradient sweep left to right, 1.5s infinite). Respect `prefers-reduced-motion` — use static grey if motion is reduced.

**ARIA:** Container: `aria-busy="true"`. Individual skeletons: `aria-hidden="true"`. When content loads, `aria-busy="false"`.

---

## 7. Apple HIG Compliance

The design follows Apple Human Interface Guidelines for web, specifically the patterns established by apple.com and native macOS/iOS interfaces. This is an aesthetic and feel alignment, not a strict iOS SDK constraint — but key principles must be honoured.

### 7.1 Typography

**Font stack:**
```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
             "Helvetica Neue", Arial, sans-serif;
```

**Type scale (Tailwind-compatible):**

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| `display` | 28px / 1.75rem | 700 (bold) | 1.2 | Page titles |
| `title-1` | 22px / 1.375rem | 600 (semibold) | 1.3 | Section headers |
| `title-2` | 17px / 1.0625rem | 600 (semibold) | 1.35 | Card titles, agent names |
| `body` | 15px / 0.9375rem | 400 (regular) | 1.5 | Default body text |
| `callout` | 13px / 0.8125rem | 400 (regular) | 1.4 | Secondary labels, metadata |
| `caption` | 11px / 0.6875rem | 400 (regular) | 1.3 | Timestamps, footnotes |

**Key rule:** Never go below 11px. Never use more than 5 distinct text sizes in a single view.

### 7.2 Colour Tokens

**Background hierarchy (light mode only):**

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-primary` | `#FFFFFF` | Cards, sheets, primary surfaces |
| `bg-secondary` | `#F2F2F7` | Page background, grouped list background |
| `bg-tertiary` | `#EFEFF4` | Inset content, secondary cards |
| `bg-grouped-primary` | `#FFFFFF` | First level in grouped content |

**System colours (Apple semantic colours — light mode):**

| Token | Hex | Usage |
|-------|-----|-------|
| `system-blue` | `#007AFF` | Primary actions, focus rings, links |
| `system-green` | `#34C759` | Active status, under-budget progress |
| `system-orange` | `#FF9500` | Amber warnings |
| `system-red` | `#FF3B30` | Error states, over-budget |
| `system-grey` | `#8E8E93` | Inactive states, secondary text |
| `system-grey-2` | `#AEAEB2` | Separator lines |
| `system-grey-3` | `#C7C7CC` | Placeholder text |
| `system-grey-4` | `#D1D1D6` | Skeleton loaders |
| `system-grey-5` | `#E5E5EA` | Grouped borders |
| `system-grey-6` | `#F2F2F7` | Background fills |
| `label-primary` | `#000000` | Primary text |
| `label-secondary` | `#3C3C43` at 60% opacity → `#636366` | Secondary text |
| `label-tertiary` | `#3C3C43` at 30% opacity → `#A2A2A7` | Tertiary / hint text |

**Note to Sienna:** Implement these as CSS custom properties (`--color-system-blue`, etc.) and Tailwind config extensions. Do not hardcode hex values in components.

### 7.3 Spacing

Apple uses an 8pt base grid. All spacing values should be multiples of 4px (with 8px as the standard unit).

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Micro gaps |
| `space-2` | 8px | Tight internal padding |
| `space-3` | 12px | Component internal padding |
| `space-4` | 16px | Standard padding (card internals, form fields) |
| `space-5` | 20px | Comfortable section gaps |
| `space-6` | 24px | Large component gaps |
| `space-8` | 32px | Section-to-section spacing |
| `space-10` | 40px | Major layout divisions |

### 7.4 Borders & Shadows

**Border radius:**

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 8px | Small elements (badges, chips) |
| `radius-md` | 12px | Form inputs, small cards |
| `radius-lg` | 16px | Medium cards |
| `radius-xl` | 20px | Large cards (AgentCard) |
| `radius-2xl` | 24px | Login card, bottom sheet |
| `radius-full` | 9999px | Pills, status badges |

**Shadows (Apple-style — soft, not material):**

```css
/* shadow-sm — card resting */
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);

/* shadow-md — card hover / interactive element at rest */
box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05);

/* shadow-lg — modal / sheet backdrop shadow */
box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12), 0 4px 10px rgba(0, 0, 0, 0.08);

/* shadow-none — active/pressed state */
box-shadow: none;
```

### 7.5 Motion & Animation

- Transitions: `150ms ease-out` for micro-interactions (hover, press)
- Panel/sheet open: `250–300ms ease-out`
- Progress bar fill: `600ms ease-in-out`
- Pulse animation: `1400ms ease-in-out infinite`
- **Always check `prefers-reduced-motion`** — disable all animations except instant state changes when it is `reduce`.

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 7.6 Iconography

Use SF Symbols via CSS/SVG where the web equivalent is available. Fall back to Heroicons (outline style) for icons without a web-ready SF Symbols equivalent.

**Key icons needed:**

| Use | SF Symbol | Heroicon fallback |
|-----|-----------|------------------|
| The Floor nav | `building.2` | `office-building` |
| The Ledger nav | `dollarsign.circle` | `currency-dollar` |
| The Feed nav | `list.bullet.rectangle` | `list-bullet` |
| Close | `xmark` | `x-mark` |
| Warning | `exclamationmark.triangle` | `exclamation-triangle` |
| Sort ascending | `chevron.up` | `chevron-up` |
| Sort descending | `chevron.down` | `chevron-down` |
| Show password | `eye` | `eye` |
| Hide password | `eye.slash` | `eye-slash` |
| Refresh | `arrow.clockwise` | `arrow-path` |

---

## 8. Responsive Behaviour

### 8.1 Breakpoints

```
xs:   375px  — iPhone SE (smallest supported)
sm:   390px  — iPhone 14 / 15
md:   768px  — iPad portrait
lg:   1024px — iPad landscape / small desktop
xl:   1280px — Standard desktop
2xl:  1440px — Wide desktop
```

**Minimum supported width:** 375px. Do not introduce horizontal scroll at this width.

### 8.2 Navigation

| Breakpoint | Nav pattern |
|-----------|-------------|
| 375–767px | Bottom tab bar, full width |
| 768–1023px | Bottom tab bar OR top nav (test with Harvey — likely bottom tab feels natural on iPad too) |
| ≥1024px | Left navigation rail — icon only (64px wide) |
| ≥1200px | Left navigation rail — icon + label (220px wide) |

**Bottom tab bar height:** 49px + safe area inset (CSS `env(safe-area-inset-bottom)`).

**Content area:** Full width minus nav width. On mobile, bottom padding = tab bar height + 8px to prevent content being obscured.

### 8.3 The Floor — Responsive Grid

| Breakpoint | Columns | Column gap | Card padding |
|-----------|---------|-----------|--------------|
| 375–767px | 1 | — | 12px |
| 768–1023px | 2 | 16px | 14px |
| 1024–1439px | 3 | 16px | 16px |
| ≥1440px | 4 | 16px | 16px |

**Agent Detail Panel — responsive:**
- 375–767px: Full-screen bottom sheet (leaves no visible background)
- 768–1023px: Bottom sheet at 75% viewport height
- ≥1024px: Right-side panel, 400px wide; grid area reduces to fill remaining space

### 8.4 The Ledger — Responsive Layout

| Breakpoint | Layout |
|-----------|--------|
| 375–767px | Single column. Spend summary: 2×2 grid. Table: horizontal scroll. |
| 768–1023px | Single column, slightly wider cards. Table: full width with comfortable columns. |
| ≥1024px | Two-column: Summary + Provider breakdown (left), Agent table (right). |

**Spend summary on mobile (375px):** 2×2 grid of summary cards, not a 4-item row (would be too compressed).

**Agent cost table:** Always a table (not cards) for comparative reading. Horizontal scroll on mobile with sticky first column (agent name).

### 8.5 The Feed — Responsive Layout

| Breakpoint | Layout |
|-----------|--------|
| 375–767px | Single column. Filter chips: horizontally scrollable row. Entry: emoji left, content right. |
| 768–1023px | Single column, wider. Filter chips: wrapping or scrollable. |
| ≥1024px | Single column, max-width 800px, centred. |

**Filter chips at 375px:** Horizontal scroll. Show first chip partially cut off to signal scrollability. `scroll-snap-type: x mandatory` on container.

### 8.6 Login — Responsive

| Breakpoint | Layout |
|-----------|--------|
| 375–767px | Card fills full width, 16px horizontal margin each side |
| 768px+ | Centred card, max-width 400px |

### 8.7 Typography Scaling

No font scaling between breakpoints — the type scale defined in §7.1 applies at all breakpoints. The grid and layout change; the text does not reflow with different sizes. Exception: the display title on desktop may use a slightly larger size (32px vs 28px) if space permits.

---

## 9. Accessibility Requirements

### 9.1 Focus Order

**Login:**
1. SCC Logo (skip — not interactive)
2. Password field
3. Show/hide password toggle
4. Sign In button
5. Error message (announced, not in tab order unless it contains a link)

**The Floor:**
1. Navigation (tab bar / nav rail) — consistent position
2. Last updated indicator (skip with keyboard shortcut if implemented)
3. Agent cards — left-to-right, top-to-bottom (reading order matches visual order)
4. When Agent Detail Panel is open: focus trapped in panel (close button → panel content → "View full history" link)

**The Ledger:**
1. Navigation
2. Budget alert banner (if visible) — close button reachable
3. Spend summary figures
4. Budget progress bar
5. Provider rows (with sparkline charts — marked `aria-hidden` or with descriptive labels)
6. Sort controls (column headers)
7. Agent cost rows

**The Feed:**
1. Navigation
2. Filter chips (arrow keys navigate between chips — standard tab list pattern)
3. Feed entries (top-to-bottom, newest first)

### 9.2 Keyboard Interaction

| Element | Keys |
|---------|------|
| AgentCard | Enter / Space → opens panel |
| AgentDetailPanel | Escape → closes panel |
| AgentFilterChip | Enter / Space → selects. Arrow Left/Right → previous/next chip |
| AgentCostTable sort header | Enter / Space → cycles sort: none → ascending → descending |
| BudgetAlertBanner dismiss | Enter / Space → dismisses |
| Tab bar / Nav rail | Tab → moves through items. Enter / Space → activates |

### 9.3 Colour Contrast Requirements

All text must meet WCAG 2.1 AA minimum:
- **Body text (< 18px, not bold):** Minimum 4.5:1 contrast ratio
- **Large text (≥ 18px, or ≥ 14px bold):** Minimum 3:1 contrast ratio
- **UI components and state indicators:** Minimum 3:1 contrast ratio against adjacent colour

**Verified pairs (must be tested):**

| Text colour | Background | Ratio | Use |
|-------------|-----------|-------|-----|
| `#000000` (label-primary) | `#FFFFFF` (bg-primary) | 21:1 ✅ | All primary text |
| `#636366` (label-secondary) | `#FFFFFF` | ~6.3:1 ✅ | Secondary text |
| `#A2A2A7` (label-tertiary) | `#FFFFFF` | ~3.5:1 ✅ | Captions — verify meets 4.5:1 for body-sized text |
| `#007AFF` (system-blue) | `#FFFFFF` | ~4.5:1 ✅ | Interactive elements (verify exact value) |
| `#FFFFFF` | `#FF3B30` (system-red) | ~3.9:1 ⚠️ | Red badge text — use `#000000` text on red background instead if text is < 18px |
| `#FFFFFF` | `#34C759` (system-green) | ~2.2:1 ❌ | Do NOT use white text on green — use `#000000` or a darker green |
| `#FFFFFF` | `#FF9500` (system-orange) | ~2.8:1 ❌ | Do NOT use white text on amber — use `#000000` |

> **Note to Sienna:** The label-tertiary (`#A2A2A7`) on white only hits ~3.5:1. This meets large text requirements (3:1) but not body text (4.5:1). Use label-tertiary only for `caption` size text (11px) where it's used as true supplementary metadata, never for body-critical information. Verify with a contrast checker during implementation.

> **Critical:** Status badges use colour to communicate meaning. All badges MUST also communicate status via text — never colour alone.

### 9.4 Touch Targets

**Minimum touch target:** 44×44px on mobile for all interactive elements.

**Elements requiring special attention:**
- AgentCard: naturally large — not a concern
- StatusBadge (if tappable): must have 44px minimum even if visually smaller — use padding to extend tap area
- Filter chips: minimum 44px height, extend padding if needed
- Sort column headers: minimum 44px height
- Close buttons (×): minimum 44px tap area even if icon is 24px — use invisible padding
- Show/hide password toggle: 44×44px minimum

### 9.5 Screen Reader Requirements

**Semantic HTML:**
- Page structure: `<main>`, `<nav>`, `<header>`, `<section>`, `<article>` (for feed entries)
- Lists: `<ul>/<li>` for agent grid and feed entries
- Tables: proper `<table>`, `<thead>`, `<tbody>`, `<th scope="col">` for Ledger table
- Forms: `<label>` associated with inputs, `<fieldset>` if grouping

**Dynamic content announcements:**
- Data refresh (60s poll): do NOT announce every refresh — only announce if data changes state (new error, alert cleared, etc.)
- Budget threshold crossed: `aria-live="assertive"` for alert banner appearance
- Filter change (Feed): announce new count of results: "Showing [N] entries for [Agent name]" via `aria-live="polite"` region
- Sort change (Ledger table): announce new sort via `aria-live="polite"` region

**ARIA landmarks:**
```html
<nav aria-label="Main navigation">...</nav>
<main id="main-content">
  <header>...</header>
  <section aria-label="[view name]">...</section>
</main>
```

**Skip link:** Provide a visually hidden skip link as the first focusable element: `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to main content</a>`

### 9.6 Reduced Motion

As defined in §7.5: all animations disabled when `prefers-reduced-motion: reduce`. Pulsing on Running agent cards becomes a static border. Shimmer on skeletons becomes static grey. Panel open/close becomes instantaneous.

### 9.7 Zoom and Text Resize

The layout must remain functional at 200% browser zoom. On mobile, user text scaling must be respected — do not suppress iOS text size adjustment (`-webkit-text-size-adjust: none` is prohibited).

---

## 10. Acceptance Criteria

These are the testable "done" conditions for each view. Zara (QA) will use these as test cases.

### AC-LOGIN-01
**Given** a user navigates to any route without an active session  
**Then** they are redirected to `/login`

### AC-LOGIN-02
**Given** a user is on `/login` and enters the correct password  
**When** they submit the form  
**Then** they are redirected to `/` (or the redirect target if one was set)

### AC-LOGIN-03
**Given** a user is on `/login` and enters an incorrect password  
**When** they submit the form  
**Then** an inline error message appears below the password field, the field is cleared, the field has focus, and the button is re-enabled

### AC-LOGIN-04
**Given** a user is on `/login` and the form is submitted  
**When** the API request is in-flight  
**Then** the button shows a spinner, the field and button are disabled, and no interaction is possible

### AC-LOGIN-05
**Given** a user navigates directly to `/ledger` without auth  
**When** login succeeds  
**Then** they are redirected to `/ledger`, not `/`

---

### AC-FLOOR-01
**Given** an authenticated user navigates to `/`  
**Then** a grid of agent cards loads, showing all 14 agents (by roster), each with: name, emoji, status badge, task summary, and last-seen timestamp

### AC-FLOOR-02
**Given** the Floor is loading  
**Then** skeleton cards are shown in the grid (14 skeletons) before data arrives; no 0-values or blank cards are shown

### AC-FLOOR-03
**Given** the 60-second poll completes  
**Then** the "Last updated" indicator resets to "Updated just now" (or equivalent)

### AC-FLOOR-04
**Given** a Running-status agent card is visible  
**Then** the card has a visible pulsing animation on its border

### AC-FLOOR-05
**Given** `prefers-reduced-motion: reduce` is active  
**Then** no animations play — all agent cards are static regardless of status

### AC-FLOOR-06
**Given** a poll request fails  
**Then** the previous data remains visible, and a stale data warning appears; the grid does not blank out

### AC-FLOOR-07
**Given** a user is viewing the Floor on a 375px viewport  
**Then** agent cards display in a single column with no horizontal overflow

---

### AC-PANEL-01
**Given** a user taps an agent card  
**Then** the Agent Detail Panel opens (sheet on mobile, side panel on desktop) with the agent's name, emoji, status, current task, last-seen timestamp, spend today, and up to 5 recent activity entries

### AC-PANEL-02
**Given** the Agent Detail Panel is open  
**Then** focus is moved to the close button inside the panel, and focus is trapped within the panel while it is open

### AC-PANEL-03
**Given** the Agent Detail Panel is open  
**When** the user presses Escape  
**Then** the panel closes and focus returns to the card that was tapped

### AC-PANEL-04
**Given** a user taps "View full history" in the Agent Detail Panel  
**Then** they are navigated to `/feed?agent=[agentId]` with that agent's filter pre-selected

---

### AC-LEDGER-01
**Given** an authenticated user navigates to `/ledger`  
**Then** they see: spend summary row (Today/Week/Month/All-time), budget progress bar, provider breakdown with sparklines, and agent cost table

### AC-LEDGER-02
**Given** monthly spend is below $400  
**Then** no budget alert banner is visible, the progress bar is green, and the Ledger nav item has no indicator dot

### AC-LEDGER-03
**Given** monthly spend reaches or exceeds $400  
**Then** an amber alert banner appears at the top of the Ledger, the progress bar turns amber, and the Ledger nav item shows an amber dot

### AC-LEDGER-04
**Given** monthly spend reaches or exceeds $475  
**Then** the alert banner turns red, the progress bar turns red, and the nav indicator turns red

### AC-LEDGER-05
**Given** monthly spend reaches or exceeds $500  
**Then** the alert banner shows the critical variant, the progress bar pulses red, and the nav indicator pulses red

### AC-LEDGER-06
**Given** the user dismisses the alert banner (taps ×)  
**Then** the banner is hidden for the remainder of the session; it reappears on the next page load if the threshold is still exceeded

### AC-LEDGER-07
**Given** the cost API is unreachable and cached data exists  
**Then** the Ledger shows the last-known figures clearly labelled with "Last updated [time]" and a [COPY: stale data warning]

### AC-LEDGER-08
**Given** the agent cost table default load  
**Then** agents are sorted alphabetically by name

### AC-LEDGER-09
**Given** a user clicks a sortable column header  
**Then** the table re-sorts by that column (ascending), the header shows ↑, and an `aria-sort="ascending"` attribute is set

### AC-LEDGER-10
**Given** a user clicks the same column header a second time  
**Then** sort toggles to descending, the header shows ↓, and `aria-sort="descending"` is set

---

### AC-FEED-01
**Given** an authenticated user navigates to `/feed`  
**Then** they see a chronological timeline of today's agent activity, newest first, with agent emoji, name, relative timestamp, and plain-English action summary for each entry

### AC-FEED-02
**Given** the Feed loads  
**Then** "All agents" filter chip is selected by default

### AC-FEED-03
**Given** a user taps an agent filter chip  
**Then** the feed filters to show only that agent's entries, the chip is visually selected, and all other chips are deselected

### AC-FEED-04
**Given** a user taps the "All agents" chip  
**Then** all filter selections are cleared and all entries are shown

### AC-FEED-05
**Given** a user arrives at `/feed?agent=[agentId]`  
**Then** the feed is pre-filtered to that agent and the corresponding chip is pre-selected

### AC-FEED-06
**Given** there are no entries for the current filter  
**Then** an appropriate empty state message is shown (not a blank screen)

### AC-FEED-07
**Given** a user hovers over a timestamp (desktop) or taps it (mobile)  
**Then** the absolute timestamp is revealed (format: HH:MM:SS)

### AC-FEED-08
**Given** the filter chip row contains 15 items (All + 14 agents) at 375px width  
**Then** chips are horizontally scrollable with no overflow or wrapping into multiple lines

---

### AC-A11Y-01
**Given** any interactive element on any view  
**Then** it has a minimum touch/click target of 44×44px

### AC-A11Y-02
**Given** any status badge  
**Then** status is conveyed via both colour AND text (not colour alone)

### AC-A11Y-03
**Given** the Agent Detail Panel is open  
**Then** keyboard focus cannot exit the panel until it is dismissed

### AC-A11Y-04
**Given** a budget alert banner appears  
**Then** it is announced to screen readers via `aria-live="assertive"`

### AC-A11Y-05
**Given** the AgentCard grid is rendered  
**Then** cards can be navigated and activated using keyboard alone (Tab + Enter/Space)

### AC-A11Y-06
**Given** the filter chip row on The Feed  
**Then** arrow keys navigate between chips, and Enter/Space selects

### AC-A11Y-07
**Given** any text in the application  
**Then** all body text meets minimum 4.5:1 colour contrast ratio; large text meets 3:1 minimum

### AC-RESPONSIVE-01
**Given** the app is viewed at 375px width  
**Then** no horizontal scrollbar appears (except the explicitly scrollable filter chip row and agent table)

### AC-RESPONSIVE-02
**Given** the app is viewed at 1440px width  
**Then** the agent grid shows 4 columns and the navigation rail shows icons with labels

---

## 11. Open Questions

These must be resolved before or during build. Sienna: do not implement the affected area until these are resolved.

| # | Question | Owner | Affects |
|---|---------|-------|---------|
| 1 | Does the $475 threshold trigger a Telegram alert, or is it in-app only? | Harvey to confirm | §4.6, AC-LEDGER-04, Telegram integration |
| 2 | What is the exact password authentication mechanism? (single hardcoded password, environment variable, or a more sophisticated auth?) | Marcus / Clawdia | Login flow, security |
| 3 | Should session persistence survive browser close (cookie) or expire on tab close (sessionStorage)? | Harvey | Login flow, session management |
| 4 | What is the desired tablet navigation pattern — bottom tab bar or side nav? | Harvey to review | §8.2 |
| 5 | Should the app support multiple simultaneous users? (e.g. Harvey + a team member) | Harvey | Auth architecture |
| 6 | For agent "current task" — is this derived from the log file, OpenClaw sessions output, or a combination? | Dex / Marcus | AgentCard data model |
| 7 | What is the maximum number of Feed entries to display? Is pagination needed, or load-more? | Marcus / Harvey | Feed component, API design |
| 8 | What format are agent cost figures in? Per-token, per-API-call, or rolled up by provider? | Nadia (schema) | Ledger data model |
| 9 | Is "All time" cost tracking persistent from day one, or from deployment date? | Nadia | Ledger — SpendSummaryRow |
| 10 | [COPY: confirm preferred subtitle/tagline for the login screen] | Cass | Login view |

---

*End of UX Specification v1.0*

*Imogen — SCC Dev Team*
*Questions? Same-day response guaranteed during build phase.*
