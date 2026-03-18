// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Agent Roster
// Source of truth: PROJECT-BRIEF.md + DATA-SCHEMA.md (Appendix A)
// ─────────────────────────────────────────────────────────────────────────────

import { AgentId, AgentMeta } from '../types';

export const AGENT_ROSTER: AgentMeta[] = [
  { id: 'clawdia',               name: 'Clawdia',                 emoji: '🦞', type: 'orchestrator' },
  { id: 'security-agent',        name: 'Security Agent',          emoji: '🔒', type: 'autonomous'   },
  { id: 'self-improvement-agent',name: 'Self-Improvement Agent',  emoji: '🌙', type: 'autonomous'   },
  { id: 'marcus',                name: 'Marcus',                  emoji: '⚙️', type: 'dev-subagent' },
  { id: 'sienna',                name: 'Sienna',                  emoji: '🎨', type: 'dev-subagent' },
  { id: 'dex',                   name: 'Dex',                     emoji: '🔗', type: 'dev-subagent' },
  { id: 'nadia',                 name: 'Nadia',                   emoji: '🗄️', type: 'dev-subagent' },
  { id: 'eli',                   name: 'Eli',                     emoji: '🔍', type: 'dev-subagent' },
  { id: 'zara',                  name: 'Zara',                    emoji: '🧪', type: 'dev-subagent' },
  { id: 'roan',                  name: 'Roan',                    emoji: '🔒', type: 'dev-subagent' },
  { id: 'imogen',                name: 'Imogen',                  emoji: '🖼️', type: 'dev-subagent' },
  { id: 'cass',                  name: 'Cass',                    emoji: '✍️', type: 'dev-subagent' },
  { id: 'otto',                  name: 'Otto',                    emoji: '📦', type: 'dev-subagent' },
  { id: 'phoebe',                name: 'Phoebe',                  emoji: '📊', type: 'dev-subagent' },
] as const;

export const AGENT_IDS: AgentId[] = AGENT_ROSTER.map((a) => a.id);

export const AGENT_MAP = new Map<AgentId, AgentMeta>(
  AGENT_ROSTER.map((a) => [a.id, a]),
);

/** Sort order: orchestrators first, then autonomous, then dev-subagents, alphabetical within type. */
const TYPE_ORDER: Record<AgentMeta['type'], number> = {
  orchestrator: 0,
  autonomous: 1,
  'dev-subagent': 2,
};

export function sortedAgentRoster(): AgentMeta[] {
  return [...AGENT_ROSTER].sort((a, b) => {
    const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (typeDiff !== 0) return typeDiff;
    return a.name.localeCompare(b.name);
  });
}

export function isValidAgentId(id: string): id is AgentId {
  return AGENT_IDS.includes(id as AgentId);
}
