# SCC Office Dashboard — Frontend

React 19 + Vite + TypeScript + Tailwind CSS frontend for The Office.

## Setup

```bash
npm install
npm run dev       # Dev server (proxies /api to localhost:3000)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
```

## Architecture

```
src/
  components/
    ui/           # Base design system components
    layout/       # AppShell (nav rail + tab bar)
    AgentCard.tsx
    AgentDetailPanel.tsx
  hooks/
    useAuth.tsx   # Auth state (sessionStorage + HTTP-only cookie)
  lib/
    api.ts        # Typed API client + TanStack Query keys
    queryClient.ts # QueryClient (60s refetch interval)
    utils.ts      # Time formatting, cost formatting, agent roster
  pages/
    Login.tsx
    Floor.tsx     # / — agent grid
    Ledger.tsx    # /ledger — cost breakdown
    Feed.tsx      # /feed — activity timeline
  types/
    index.ts      # All TypeScript interfaces matching DATA-SCHEMA.md
  styles/
    global.css    # Tailwind + Apple design tokens + animations
  App.tsx         # Routes (React Router v7)
  main.tsx        # Entry point
```

## Design System

- **Font:** SF Pro (system font stack, no external load)
- **Colours:** Apple semantic system colours (light mode only)
- **Success text:** `#248A3D` — white on `#34C759` green fails WCAG AA (2.2:1), fixed
- **Spacing:** 8pt grid (4px multiples)
- **Motion:** All animations respect `prefers-reduced-motion`
- **Touch targets:** 44×44px minimum on all interactive elements

## Accessibility

- WCAG 2.2 AA target
- ARIA landmarks, live regions, focus management
- Skip to main content link (first focusable element)
- Focus trap in AgentDetailPanel dialog
- Status conveyed via colour + text (never colour alone)

## API

All endpoints at `/api/*` — see `src/lib/api.ts` and DATA-SCHEMA.md.
Session maintained via HTTP-only `scc_session` cookie.
