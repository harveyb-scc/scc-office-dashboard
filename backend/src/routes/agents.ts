// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Agents Routes
// GET /api/agents
// GET /api/agents/:id
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { getAllAgentStatuses, getAgentStatus } from '../services/agentService';
import { getCostSummary } from '../services/costService';
import { getFeed } from '../services/feedService';
import { isValidAgentId } from '../constants/agents';
import { AgentId } from '../types';

const router = Router();

// All agents routes require authentication
router.use(requireAuth);

// ─── GET /api/agents ──────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const { agents, dataFreshAt } = await getAllAgentStatuses();

    res.status(200).json({
      ok: true,
      data: { agents, dataFreshAt },
    });
  }),
);

// ─── GET /api/agents/:id ──────────────────────────────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!isValidAgentId(id)) {
      throw new AppError(404, 'AGENT_NOT_FOUND', `Agent '${id}' is not in the known roster.`);
    }

    const agentId = id as AgentId;

    const [agent, costSummary, recentFeed] = await Promise.all([
      getAgentStatus(agentId),
      getCostSummary(),
      getFeed({ agentId, limit: 10 }),
    ]);

    if (!agent) {
      throw new AppError(404, 'AGENT_NOT_FOUND', `Agent '${id}' is not in the known roster.`);
    }

    // Extract per-agent cost windows from full summary
    const agentBreakdown = costSummary.byAgent.find((a) => a.agentId === agentId);

    // Build today/week/month windows for this specific agent
    // We re-use the costSummary totals as a proxy when per-agent filtering
    // is too expensive — Dex's polling loop provides per-agent records
    const emptyWindow = { costCents: 0, inputTokens: 0, outputTokens: 0, callCount: 0 };
    const costs = {
      today: agentBreakdown
        ? { costCents: agentBreakdown.costCents, inputTokens: agentBreakdown.inputTokens, outputTokens: agentBreakdown.outputTokens, callCount: agentBreakdown.callCount }
        : emptyWindow,
      week: emptyWindow,  // Filtered history queries are served by /api/costs/history?agentId=
      month: agentBreakdown
        ? { costCents: agentBreakdown.costCents, inputTokens: agentBreakdown.inputTokens, outputTokens: agentBreakdown.outputTokens, callCount: agentBreakdown.callCount }
        : emptyWindow,
    };

    res.status(200).json({
      ok: true,
      data: {
        agent,
        recentActivity: recentFeed.entries,
        costs,
      },
    });
  }),
);

export default router;
