# SCC Office Dashboard — UI Copy
**Project:** The Office
**Author:** Cass (UX Writer, SCC Dev Team)
**Version:** 1.0
**Date:** 2026-03-17
**Status:** Ready for implementation

---

> **To Sienna:** Every string in this document maps to a component or state in Imogen's UX spec. Section headers match the spec's view names. Each string is labelled with a `KEY` you can use as a copy identifier in code. Where a string includes a variable, it's shown in `[square brackets]` — replace with live data.
>
> **To Imogen:** Open Question #10 is resolved here — see `LOGIN_SUBTITLE` below. The $475 threshold is in-app only per brief; Telegram alerts fire at $400 and $500. All confirmed.

---

## Table of Contents

1. [Navigation](#1-navigation)
2. [Login Screen](#2-login-screen)
3. [The Floor](#3-the-floor)
4. [Agent Detail Panel](#4-agent-detail-panel)
5. [The Ledger](#5-the-ledger)
6. [The Feed](#6-the-feed)
7. [Error States](#7-error-states)
8. [Success States](#8-success-states)
9. [Telegram Alert Messages](#9-telegram-alert-messages)
10. [ARIA & Accessibility Strings](#10-aria--accessibility-strings)

---

## 1. Navigation

Tab bar (mobile) and navigation rail (desktop). These are the three canonical view names — do not use alternatives.

| KEY | String | Notes |
|-----|--------|-------|
| `NAV_FLOOR` | **The Floor** | Tab 1. Always capitalised as a proper noun. |
| `NAV_LEDGER` | **The Ledger** | Tab 2. Always capitalised as a proper noun. |
| `NAV_FEED` | **The Feed** | Tab 3. Always capitalised as a proper noun. |
| `NAV_LOGOUT` | Sign out | Logout button label. Lowercase "out" — follows Apple convention. |
| `NAV_BUDGET_INDICATOR_ARIA` | Monthly budget status | Screen reader label for the persistent budget dot in the nav. |

---

## 2. Login Screen

### Page Identity

| KEY | String | Notes |
|-----|--------|-------|
| `LOGIN_APP_NAME` | The Office | Displayed as the primary heading — this is the product name. |
| `LOGIN_SUBTITLE` | Every agent. Every pound. Right now. | Subheadline beneath the app name. Confident, specific, no fluff. Tells Harvey exactly what he's getting. |

### Form

| KEY | String | Notes |
|-----|--------|-------|
| `LOGIN_PASSWORD_LABEL` | Password | Field label — sits above the input, always visible. Not a placeholder. |
| `LOGIN_PASSWORD_PLACEHOLDER` | *(empty — no placeholder text)* | Labels persist; placeholders don't. Field is visually clear without one. |
| `LOGIN_SHOW_PASSWORD` | Show | Toggle label (text fallback if icon isn't available). |
| `LOGIN_HIDE_PASSWORD` | Hide | Toggle label when password is visible. |
| `LOGIN_BUTTON` | Sign in | Primary CTA. Lowercase "in" — Apple convention. Full width. |
| `LOGIN_BUTTON_LOADING` | Signing in… | Button text during in-flight request. Shows alongside inline spinner. |

### Error Messages

All errors appear below the password field (inline), in `system-red`. Field is cleared and refocused on error.

| KEY | Trigger | String |
|-----|---------|--------|
| `LOGIN_ERROR_WRONG_PASSWORD` | Incorrect password entered | That password isn't right. Try again. |
| `LOGIN_ERROR_NETWORK` | API unreachable / no connection | Can't reach the server. Check your connection and try again. |
| `LOGIN_ERROR_LOCKOUT` | 5+ failed attempts — account locked | Too many attempts. Try again in [countdown]. |
| `LOGIN_ERROR_SLOW_CONNECTION` | Auth request >3s in-flight | This is taking longer than usual. Still trying… |
| `LOGIN_ERROR_SESSION_EXPIRED` | Prior session expired, user returns | Your session ended. Sign in again to continue. |

**Notes on lockout copy:**
- `[countdown]` renders as a live timer: "14 minutes", "1 minute", "30 seconds"
- The form is fully disabled during lockout — password field and button are greyed out
- Do not show the lockout error on the first visit; only after the 5th failed attempt

---

## 3. The Floor

### Page Header

| KEY | String | Notes |
|-----|--------|-------|
| `FLOOR_TITLE` | The Floor | Page title. `display` type size. |
| `FLOOR_AGENT_COUNT` | [N] agents | Dynamic. E.g. "14 agents". Sits beside the title in `callout` size. |
| `FLOOR_LAST_UPDATED_NOW` | Updated just now | Shown immediately after a successful poll. |
| `FLOOR_LAST_UPDATED_SECONDS` | Updated [N]s ago | E.g. "Updated 23s ago". |
| `FLOOR_LAST_UPDATED_MINUTES` | Updated [N]m ago | E.g. "Updated 3m ago". |
| `FLOOR_LAST_UPDATED_FAILED` | ⚠ Update failed | Shown when the last poll errored. Amber colour. |

### Agent Status Badge Labels

These appear on every agent card and in the detail panel. Plain English — no technical shorthand.

| KEY | Status | Badge Label | Meaning for Harvey |
|-----|--------|-------------|-------------------|
| `STATUS_ACTIVE` | Active | **Working** | The agent is actively doing something right now. |
| `STATUS_RUNNING` | Running | **Running** | A scheduled task is underway. Card pulses. |
| `STATUS_IDLE` | Idle | **Idle** | The agent is online but waiting for something to do. |
| `STATUS_ERROR` | Error | **Error** | Something went wrong. Worth checking. |
| `STATUS_UNKNOWN` | Unknown | **Offline** | Can't determine status — agent may not be reachable. |

**Design note to Sienna:** Status must be communicated via both colour AND the text label above — never colour alone.

### Loading State

| KEY | String | Notes |
|-----|--------|-------|
| `FLOOR_LOADING_ARIA` | Loading agent status | Screen reader announcement while skeleton cards are shown. `aria-busy="true"` on grid container. |

### Empty State

This state should rarely (if ever) occur, since the roster is fixed. But it must be handled.

| KEY | String | Notes |
|-----|--------|-------|
| `FLOOR_EMPTY_HEADING` | No agents found | Neutral, not apologetic. |
| `FLOOR_EMPTY_BODY` | The agent roster hasn't loaded. Try refreshing the page. | Short. Tells Harvey exactly what to do. |
| `FLOOR_EMPTY_ACTION` | Refresh | Button label. |

### Error State (full grid failure)

| KEY | String | Notes |
|-----|--------|-------|
| `FLOOR_ERROR_HEADING` | Couldn't load agent status | Specific — not "something went wrong". |
| `FLOOR_ERROR_BODY` | The dashboard lost contact with the server. Your agents are likely still running — this is a display issue, not an outage. | Reassuring but honest. Doesn't cause panic. |
| `FLOOR_ERROR_ACTION` | Try again | Button label. |

### Stale Data Warning

Shown as a banner above the grid when the last poll failed but previous data is still displayed.

| KEY | String | Notes |
|-----|--------|-------|
| `FLOOR_STALE_BANNER` | ⚠ Data may be outdated — last updated [time] | E.g. "last updated 4 minutes ago". Amber. |

---

## 4. Agent Detail Panel

### Section Headings

| KEY | String | Notes |
|-----|--------|-------|
| `PANEL_SECTION_CURRENT` | Right now | Used when agent is Active or Running. Header above the current task description. |
| `PANEL_SECTION_LAST_TASK` | Last task | Used when agent is Idle or in a post-task state. |
| `PANEL_SECTION_ACTIVITY` | Recent activity | Header above the mini feed (last 3–5 entries). |
| `PANEL_SECTION_SPEND` | Spent today | Header above the agent's daily cost figure. |

### "Last Seen" Formatting

Relative timestamps. All values are formatted dynamically at render time.

| KEY | Condition | Format |
|-----|-----------|--------|
| `PANEL_LASTSEEN_NOW` | < 60 seconds ago | Just now |
| `PANEL_LASTSEEN_MINUTES` | 1–59 minutes ago | [N] minutes ago |
| `PANEL_LASTSEEN_HOUR` | Exactly 1 hour ago | 1 hour ago |
| `PANEL_LASTSEEN_HOURS` | 2–23 hours ago | [N] hours ago |
| `PANEL_LASTSEEN_YESTERDAY` | Previous calendar day | Yesterday at [HH:MM] |
| `PANEL_LASTSEEN_OLDER` | 2+ days ago | [Day] at [HH:MM] (e.g. "Monday at 09:14") |

**Note:** "1 minutes ago" is never acceptable — use "1 minute ago". Implement singular/plural correctly.

### Activity Description Templates

These describe what an agent is doing, in language Harvey can read without a tech background.

**Current task (Active / Running):**

| KEY | Template | Example |
|-----|----------|---------|
| `PANEL_TASK_ACTIVE` | Currently: [plain-English description of task] | Currently: Reviewing the latest performance creative brief |
| `PANEL_TASK_RUNNING` | Running: [task name] | Running: Daily cost summary |
| `PANEL_TASK_ACTIVE_DURATION` | Currently: [description] — [N] mins in | Currently: Processing client onboarding data — 3 mins in |

**Last task (Idle / post-task):**

| KEY | Template | Example |
|-----|----------|---------|
| `PANEL_TASK_LAST_COMPLETED` | Last task: [description] — completed [time] | Last task: Sent weekly report to Harvey — completed 12 minutes ago |
| `PANEL_TASK_LAST_FAILED` | Last task: [description] — didn't complete | Last task: Data export — didn't complete |

**Error state:**

| KEY | String | Notes |
|-----|--------|-------|
| `PANEL_TASK_ERROR` | Ran into a problem: [brief description] | E.g. "Ran into a problem: API connection timed out" |
| `PANEL_AGENT_ERROR_BODY` | This agent hit an error on its last task. It may recover on its own — check The Feed for details, or restart the agent if it stays red. | Plain English. Doesn't assume Harvey knows what to do technically, but gives him a path. |

### Panel States

| KEY | String | Notes |
|-----|--------|-------|
| `PANEL_IDLE_NO_ACTIVITY` | Nothing to show yet — [Agent name] hasn't run any tasks today. | E.g. "Nothing to show yet — Phoebe hasn't run any tasks today." Replaces activity list when idle with no history. |
| `PANEL_FETCH_ERROR_HEADING` | Couldn't load [Agent name]'s details | E.g. "Couldn't load Zara's details" |
| `PANEL_FETCH_ERROR_BODY` | The data didn't come through. | Short. Don't over-explain. |
| `PANEL_FETCH_ERROR_ACTION` | Try again | Button label. |
| `PANEL_VIEW_HISTORY` | View full history | Link to /feed?agent=[id]. Lowercase, not a button — it's a text link. |

---

## 5. The Ledger

### Page Header

| KEY | String | Notes |
|-----|--------|-------|
| `LEDGER_TITLE` | The Ledger | Page title. |

### Spend Summary Labels

These label the four top-line figures (Today / This Week / This Month / All Time).

| KEY | Label | Notes |
|-----|-------|-------|
| `LEDGER_PERIOD_TODAY` | Today | |
| `LEDGER_PERIOD_WEEK` | This week | Lowercase "week". |
| `LEDGER_PERIOD_MONTH` | This month | Lowercase "month". |
| `LEDGER_PERIOD_ALLTIME` | All time | Two words, lowercase. |

### Budget Progress Bar

| KEY | String | Notes |
|-----|--------|-------|
| `LEDGER_BUDGET_LABEL` | Monthly budget | Section label above the progress bar. |
| `LEDGER_BUDGET_PROGRESS` | $[spent] of $500 | E.g. "$342 of $500". Sits to the right of the label. |
| `LEDGER_BUDGET_PERCENT` | [N]% used | E.g. "68% used". Right-aligned below bar. |
| `LEDGER_BUDGET_REMAINING` | $[amount] left | Optional secondary label. E.g. "$158 left". |

### Provider & Agent Breakdown

| KEY | String | Notes |
|-----|--------|-------|
| `LEDGER_SECTION_PROVIDERS` | By provider | Section header above the provider breakdown. |
| `LEDGER_SECTION_AGENTS` | By agent | Section header above the agent cost table. |

### Agent Cost Table Column Headers

| KEY | Header | Sort behaviour |
|-----|--------|---------------|
| `LEDGER_COL_AGENT` | Agent | Default sort (A–Z). |
| `LEDGER_COL_TODAY` | Today | Sortable. |
| `LEDGER_COL_WEEK` | This week | Sortable. |
| `LEDGER_COL_MONTH` | This month | Sortable. |

### Budget Alert Banners

These appear at the top of The Ledger when spend thresholds are crossed. They are also visible via the nav indicator dot from any view.

**Amber warning — $400 threshold:**

| KEY | String |
|-----|--------|
| `LEDGER_ALERT_AMBER_HEADING` | Spending is climbing |
| `LEDGER_ALERT_AMBER_BODY` | You've spent $[amount] this month — 80% of your $500 budget. Keep an eye on it. |
| `LEDGER_ALERT_AMBER_DISMISS` | Got it |

**Red warning — $475 threshold:**

| KEY | String |
|-----|--------|
| `LEDGER_ALERT_RED_HEADING` | Approaching the budget limit |
| `LEDGER_ALERT_RED_BODY` | $[amount] spent this month — $[remaining] left before you hit your $500 limit. The biggest spenders are listed below. |
| `LEDGER_ALERT_RED_DISMISS` | Got it |

**Critical alert — $500 threshold:**

| KEY | String |
|-----|--------|
| `LEDGER_ALERT_CRITICAL_HEADING` | Budget limit reached |
| `LEDGER_ALERT_CRITICAL_BODY` | You've hit $[amount] this month — your $500 limit. Agent activity is continuing, but costs are now over budget. Review the table below to see where spend is concentrated. |
| `LEDGER_ALERT_CRITICAL_DISMISS` | Acknowledged |

**Design note:** "Got it" on amber/red feels proportionate to the severity. "Acknowledged" on critical signals that Harvey has consciously seen and accepted the overage — it's a deliberate word choice.

### Empty State (no spend recorded)

| KEY | String | Notes |
|-----|--------|-------|
| `LEDGER_EMPTY_HEADING` | No spending yet | Neutral, not apologetic. |
| `LEDGER_EMPTY_BODY` | Costs will appear here as agents run tasks. | Forward-looking. Tells Harvey what to expect. |

### Error States

| KEY | String | Notes |
|-----|--------|-------|
| `LEDGER_ERROR_HEADING` | Couldn't load cost data | |
| `LEDGER_ERROR_BODY` | The Ledger can't reach the cost API right now. | |
| `LEDGER_ERROR_CACHED` | Showing figures from [time] — these may not reflect the latest activity. | Used when cached data is displayed. Shown per-figure, not just once. |
| `LEDGER_ERROR_ACTION` | Try again | |
| `LEDGER_TABLE_ERROR` | Couldn't load agent costs | Inline, within the table section only. |
| `LEDGER_SPARKLINE_ERROR` | Chart unavailable | Tooltip on errored sparkline. Short — it's a tooltip. |
| `LEDGER_STALE_WARNING` | Figures as of [time] | Appears when data is >1 hour old. Shown once at top of page, not per-figure. |

---

## 6. The Feed

### Page Header

| KEY | String | Notes |
|-----|--------|-------|
| `FEED_TITLE` | The Feed | Page title. |
| `FEED_DATE_TODAY` | Today, [Day] [D] [Month] | E.g. "Today, Monday 17 March". Full date — Harvey uses this to orient himself. |

### Filter Chips

| KEY | Label | Notes |
|-----|-------|-------|
| `FEED_FILTER_ALL` | All agents | Default selected. Always the first chip. |
| `FEED_FILTER_AGENT` | [Agent emoji] [Agent name] | E.g. "🦞 Clawdia", "⚙️ Marcus". Emoji + name. |

### Empty States

| KEY | Trigger | String |
|-----|---------|--------|
| `FEED_EMPTY_ALL_HEADING` | No entries, all agents selected | Nothing's happened yet today |
| `FEED_EMPTY_ALL_BODY` | No entries, all agents selected | Agent activity will appear here as it happens. |
| `FEED_EMPTY_AGENT_HEADING` | No entries for a specific agent | [Agent name] hasn't logged anything today |
| `FEED_EMPTY_AGENT_BODY` | No entries for a specific agent | Switch to All agents to see what the rest of the team has been up to. |

### Error State

| KEY | String |
|-----|--------|
| `FEED_ERROR_HEADING` | Couldn't load activity |
| `FEED_ERROR_BODY` | The Feed can't reach the log right now. |
| `FEED_ERROR_ACTION` | Try again |

### Feed Entry Formats

Each feed entry has two components: the **action label** (bold, short) and the **action summary** (plain English sentence). Timestamps are relative by default; absolute on hover/tap.

**Action types and copy templates:**

---

**Action type: Task started**

| KEY | Template | Example |
|-----|----------|---------|
| `FEED_ACTION_TASK_STARTED_LABEL` | Started | |
| `FEED_ACTION_TASK_STARTED` | Started: [plain-English task description] | Started: Reviewing this week's TikTok Shop performance data |

---

**Action type: Task completed**

| KEY | Template | Example |
|-----|----------|---------|
| `FEED_ACTION_TASK_DONE_LABEL` | Completed | |
| `FEED_ACTION_TASK_DONE` | Completed: [plain-English task description] | Completed: Weekly cost summary sent to Harvey |

---

**Action type: Task failed**

| KEY | Template | Example |
|-----|----------|---------|
| `FEED_ACTION_TASK_FAILED_LABEL` | Error | |
| `FEED_ACTION_TASK_FAILED` | Couldn't complete: [plain-English task description] — [brief reason if known] | Couldn't complete: Data export — connection timed out |

---

**Action type: Scheduled run**

| KEY | Template | Example |
|-----|----------|---------|
| `FEED_ACTION_SCHEDULED_LABEL` | Scheduled | |
| `FEED_ACTION_SCHEDULED` | Ran scheduled task: [task name] | Ran scheduled task: Daily cost reconciliation |

---

**Action type: Alert sent**

| KEY | Template | Example |
|-----|----------|---------|
| `FEED_ACTION_ALERT_LABEL` | Alert | |
| `FEED_ACTION_ALERT` | Sent an alert: [description] | Sent an alert: Monthly budget reached $400 |

---

**Action type: Status change — came online**

| KEY | Template | Example |
|-----|----------|---------|
| `FEED_ACTION_ONLINE_LABEL` | Online | |
| `FEED_ACTION_ONLINE` | Came online | Came online |

---

**Action type: Status change — went idle**

| KEY | Template | Example |
|-----|----------|---------|
| `FEED_ACTION_IDLE_LABEL` | Idle | |
| `FEED_ACTION_IDLE` | Finished up and went idle | Finished up and went idle |

---

**Action type: Budget event**

These entries appear under Clawdia or the system, not individual agents.

| KEY | Template | Example |
|-----|----------|---------|
| `FEED_ACTION_BUDGET_LABEL` | Budget | |
| `FEED_ACTION_BUDGET` | Monthly spend reached $[amount] ([N]% of budget) | Monthly spend reached $400 (80% of budget) |

---

**Timestamp formats** (used in all feed entries):

| KEY | Condition | Format |
|-----|-----------|--------|
| `FEED_TIME_NOW` | < 60 seconds | Just now |
| `FEED_TIME_MINUTES` | 1–59 minutes | [N] mins ago |
| `FEED_TIME_HOUR` | 60 minutes | 1 hour ago |
| `FEED_TIME_HOURS` | 2–23 hours | [N] hours ago |
| `FEED_TIME_ABSOLUTE` | On hover/tap | [HH:MM:SS] (e.g. "14:23:07") |

---

## 7. Error States

### Generic / Catch-all

For unclassified errors that don't fit a specific state above.

| KEY | String |
|-----|--------|
| `ERROR_GENERIC_HEADING` | Something didn't load |
| `ERROR_GENERIC_BODY` | There was a problem fetching this data. |
| `ERROR_GENERIC_ACTION` | Try again |

### Data Load Failure

For when a view fails to fetch any data on initial load.

| KEY | String |
|-----|--------|
| `ERROR_LOAD_HEADING` | Couldn't load this view |
| `ERROR_LOAD_BODY` | The server didn't respond. This is usually temporary — wait a moment and try again. |
| `ERROR_LOAD_ACTION` | Retry |

### API Timeout

For when a request times out specifically (not just a general network failure).

| KEY | String |
|-----|--------|
| `ERROR_TIMEOUT_HEADING` | That took too long |
| `ERROR_TIMEOUT_BODY` | The request timed out before the server responded. The data may still be coming — try refreshing. |
| `ERROR_TIMEOUT_ACTION` | Refresh |

---

## 8. Success States

### Login Success

No explicit success message is shown — the transition to The Floor IS the confirmation. However, the loading state between form submission and redirect needs copy.

| KEY | String | Notes |
|-----|--------|-------|
| `LOGIN_SUCCESS_LOADING` | Signing in… | Shown on the button during auth + redirect. Removed when redirect fires. |

*There is intentionally no "You're signed in!" banner — it would flash and disappear. The Floor is the welcome.*

### Logout Confirmation

Shown after Harvey taps "Sign out". Two-step: confirmation prompt, then confirmation of completion.

**Confirmation prompt (before signing out):**

| KEY | String |
|-----|--------|
| `LOGOUT_CONFIRM_HEADING` | Sign out? |
| `LOGOUT_CONFIRM_BODY` | You'll need to sign back in to view the dashboard. |
| `LOGOUT_CONFIRM_ACTION` | Sign out |
| `LOGOUT_CONFIRM_CANCEL` | Cancel |

**After signing out (on the login screen):**

| KEY | String | Notes |
|-----|--------|-------|
| `LOGOUT_SUCCESS_MESSAGE` | You've signed out. | Brief. Shown as a one-line notice above the login form, in `label-secondary` colour. Fades after 3 seconds. |

---

## 9. Telegram Alert Messages

These are the exact messages sent to Harvey's Telegram when budget thresholds are hit. They're sent by Clawdia / the backend, not generated in the frontend — but the copy is defined here for clarity and consistency.

Harvey reads these on his phone. They need to be instantly clear without any dashboard context.

---

### $400 Alert — Amber threshold

**Trigger:** Monthly spend reaches $400.

```
💛 Heads up — The Office

Your agents have spent $[amount] this month, which is 80% of your $500 budget.

Nothing to worry about yet, but worth keeping an eye on. The biggest spenders are in The Ledger.

→ Open The Ledger: [dashboard URL]/ledger
```

**Notes:**
- 💛 yellow heart deliberately chosen — serious enough to notice, not alarming
- "Nothing to worry about yet" is intentional reassurance at this threshold
- Direct link lands on /ledger (not the homepage)
- `[amount]` = exact dollar figure to two decimal places, e.g. "$401.23"

---

### $500 Alert — Critical threshold

**Trigger:** Monthly spend reaches or exceeds $500.

```
🔴 Budget limit hit — The Office

Monthly spend has reached $[amount] — you've hit your $500 limit.

Agents are still running. This is a heads-up, not an outage. Check The Ledger to see what's driving spend and decide if you want to review any agent activity.

→ Open The Ledger: [dashboard URL]/ledger
```

**Notes:**
- 🔴 red circle is unambiguous — this is the real alert
- "Agents are still running. This is a heads-up, not an outage." — critical line. Harvey needs to know nothing has broken; this is financial, not operational
- Gives Harvey clear agency: "decide if you want to review" — doesn't tell him what to do
- `[amount]` = exact figure, e.g. "$503.47"

---

**On the $475 threshold:** Per the project brief and Imogen's spec note, Telegram alerts fire at $400 and $500 only. The $475 threshold is in-app only (red banner + nav indicator). No Telegram message at $475.

---

## 10. ARIA & Accessibility Strings

These are for screen reader labels, `aria-label` attributes, and `aria-live` announcements. Written as natural language — not variable names.

| KEY | ARIA String | Used on |
|-----|-------------|---------|
| `ARIA_NAV_MAIN` | Main navigation | `<nav aria-label>` |
| `ARIA_NAV_BUDGET_DOT_AMBER` | Budget warning — spending is high | Nav budget indicator dot, amber state |
| `ARIA_NAV_BUDGET_DOT_RED` | Budget alert — approaching limit | Nav budget indicator dot, red state |
| `ARIA_NAV_BUDGET_DOT_CRITICAL` | Budget limit reached | Nav budget indicator dot, critical state |
| `ARIA_PASSWORD_SHOW` | Show password | Eye icon toggle button, password hidden state |
| `ARIA_PASSWORD_HIDE` | Hide password | Eye icon toggle button, password visible state |
| `ARIA_FLOOR_GRID_LOADING` | Loading agent status, please wait | Grid container while `aria-busy="true"` |
| `ARIA_AGENT_CARD` | [Agent name], [status label], [task summary] | `role="button"` on AgentCard. E.g. "Clawdia, Working, Currently reviewing the performance brief" |
| `ARIA_STATUS_BADGE` | Status: [status label] | `aria-label` on StatusBadge |
| `ARIA_PANEL_LABEL` | [Agent name] details | `aria-label` on `role="dialog"` panel |
| `ARIA_PANEL_CLOSE` | Close [Agent name] details | Close (×) button in panel |
| `ARIA_BUDGET_BAR` | Monthly budget: $[spent] of $500, [N]% used | `role="progressbar"` `aria-label` |
| `ARIA_BUDGET_VALUE_LIVE` | Monthly spend is now $[amount] | `aria-live="polite"` announcement when value updates |
| `ARIA_ALERT_DISMISS` | Dismiss budget alert | Dismiss (×) button on BudgetAlertBanner |
| `ARIA_ALERT_CRITICAL_ANNOUNCE` | Budget limit reached. Monthly spend is $[amount]. | `aria-live="assertive"` when critical banner appears |
| `ARIA_FILTER_CHIPS` | Filter activity by agent | `role="tablist"` `aria-label` on chip row |
| `ARIA_FILTER_ALL` | All agents, selected | "All agents" chip when active |
| `ARIA_FILTER_AGENT_SELECTED` | [Agent name], selected | Agent chip when active |
| `ARIA_FILTER_AGENT_UNSELECTED` | [Agent name], not selected | Agent chip when inactive |
| `ARIA_FEED_RESULT_COUNT` | Showing [N] entries for [Agent name] | `aria-live="polite"` after filter change |
| `ARIA_FEED_RESULT_COUNT_ALL` | Showing [N] entries for all agents | `aria-live="polite"` when all-agents filter selected |
| `ARIA_SORT_ASCENDING` | [Column name], sorted ascending | Column header when sorted ↑ |
| `ARIA_SORT_DESCENDING` | [Column name], sorted descending | Column header when sorted ↓ |
| `ARIA_SORT_NONE` | [Column name], not sorted | Column header default state |
| `ARIA_SORT_ANNOUNCE` | Agent table sorted by [column], [direction] | `aria-live="polite"` after sort change |
| `ARIA_SPARKLINE` | [Provider name] hourly spend over the last 24 hours | `role="img"` `aria-label` on SparklineChart |
| `ARIA_SPARKLINE_ERROR` | [Provider name] hourly spend chart unavailable | Chart error state |
| `ARIA_LASTUPDATED` | Last updated [time] | `aria-live="polite"` LastUpdatedIndicator |
| `ARIA_SKELETON` | Loading | Container around SkeletonLoader groups |
| `ARIA_SKIP_LINK` | Skip to main content | Visually hidden skip link, first focusable element on every page |
| `ARIA_TIMESTAMP_FULL` | [Full timestamp, e.g. "14 March 2026 at 14:23:07"] | `<time>` element `aria-label` for feed entries |

---

## Copy Notes & Decisions

A few decisions worth recording so future copy is consistent:

**"Sign in" not "Log in"**
Apple uses "Sign in" throughout its product ecosystem. Consistent with our HIG alignment.

**"The Floor / The Ledger / The Feed" always capitalised**
These are proper nouns — the canonical names of the three views. Treat them like product names within the product.

**No exclamation points**
Cass's rule, and a good one: exclamation points in error or warning states are patronising. Even in success states, we're confident without being excitable.

**Relative timestamps, absolute on demand**
Harvey doesn't need clock times when scanning. He needs "3 minutes ago". But when auditing The Feed, he may want the precise time — hence the hover/tap to reveal behaviour.

**"Just now" not "0 minutes ago"**
"0 minutes ago" is technically accurate and humanly awful. "Just now" is what a colleague would say.

**Ledger figures to two decimal places**
E.g. "$342.18", not "$342". Precision matters in a cost dashboard. Harvey's a COO — he wants the exact number.

**Telegram messages use plain paragraphs, not markdown**
Telegram supports some markdown, but these messages need to work clearly even if formatting doesn't render. Short sentences, one idea per line.

---

*Cass — SCC Dev Team*
*Questions on copy? Same-day turnaround during build phase. Ping me before making editorial changes in code — I'd rather you ask than guess.*
