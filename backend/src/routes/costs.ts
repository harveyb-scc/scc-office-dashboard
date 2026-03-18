// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Costs Routes
// GET /api/costs
// GET /api/costs/history
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getCostSummary, getCostHistory } from '../services/costService';
import { isValidAgentId } from '../constants/agents';
import { AgentId, Provider } from '../types';

const router = Router();

router.use(requireAuth);

const VALID_PROVIDERS: Provider[] = ['anthropic', 'gemini', 'openai'];

// ─── GET /api/costs ───────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const summary = await getCostSummary();
    res.status(200).json({ ok: true, data: summary });
  }),
);

// ─── GET /api/costs/history ───────────────────────────────────────────────────

const historyQuerySchema = z.object({
  hours: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 168))
    .refine((v) => Number.isInteger(v) && v > 0 && v <= 720, {
      message: 'INVALID_HOURS',
    }),
  agentId: z.string().optional(),
  provider: z.string().optional(),
});

router.get(
  '/history',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = historyQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      const code = parsed.error.issues[0]?.message ?? 'VALIDATION_ERROR';
      if (code === 'INVALID_HOURS') {
        throw new AppError(400, 'INVALID_HOURS', 'hours must be a positive integer between 1 and 720.');
      }
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query parameters.');
    }

    const { hours, agentId: rawAgentId, provider: rawProvider } = parsed.data;

    // Validate agentId if provided
    let agentId: AgentId | null = null;
    if (rawAgentId) {
      if (!isValidAgentId(rawAgentId)) {
        throw new AppError(400, 'INVALID_AGENT_ID', `'${rawAgentId}' is not a known agent ID.`);
      }
      agentId = rawAgentId as AgentId;
    }

    // Validate provider if provided
    let provider: Provider | null = null;
    if (rawProvider) {
      if (!VALID_PROVIDERS.includes(rawProvider as Provider)) {
        throw new AppError(400, 'INVALID_PROVIDER', `'${rawProvider}' is not a known provider.`);
      }
      provider = rawProvider as Provider;
    }

    const history = await getCostHistory(hours, agentId, provider);
    res.status(200).json({ ok: true, data: history });
  }),
);

export default router;
