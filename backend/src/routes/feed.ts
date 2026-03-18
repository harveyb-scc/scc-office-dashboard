// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Feed Route
// GET /api/feed
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getFeed } from '../services/feedService';
import { isValidAgentId } from '../constants/agents';
import { AgentId } from '../types';

const router = Router();

router.use(requireAuth);

const feedQuerySchema = z.object({
  agentId: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 50))
    .refine((v) => Number.isInteger(v) && v > 0 && v <= 200, {
      message: 'INVALID_LIMIT',
    }),
  cursor: z.string().optional(),
});

// ─── GET /api/feed ────────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = feedQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      const code = parsed.error.issues[0]?.message ?? 'VALIDATION_ERROR';
      if (code === 'INVALID_LIMIT') {
        throw new AppError(400, 'INVALID_LIMIT', 'limit must be a positive integer between 1 and 200.');
      }
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query parameters.');
    }

    const { agentId: rawAgentId, limit, cursor } = parsed.data;

    // Validate agentId if provided
    let agentId: AgentId | undefined;
    if (rawAgentId) {
      if (!isValidAgentId(rawAgentId)) {
        throw new AppError(400, 'INVALID_AGENT_ID', `'${rawAgentId}' is not a known agent ID.`);
      }
      agentId = rawAgentId as AgentId;
    }

    let response;
    try {
      response = await getFeed({ agentId, limit, cursor });
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_CURSOR') {
        throw new AppError(400, 'INVALID_CURSOR', 'Pagination cursor is invalid or expired.');
      }
      throw err;
    }

    res.status(200).json({ ok: true, data: response });
  }),
);

export default router;
