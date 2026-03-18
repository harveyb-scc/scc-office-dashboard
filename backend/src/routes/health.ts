// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Health Route
// GET /api/health — no auth required
//
// Returns only { status: "ok", timestamp: ISO_STRING } to avoid leaking
// operational details to unauthenticated callers.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
