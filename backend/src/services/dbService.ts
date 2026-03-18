// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Replit DB Singleton
// Single shared client instance across all services.
// ─────────────────────────────────────────────────────────────────────────────

import Database from '@replit/database';

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database();
  }
  return db;
}

/**
 * List all keys matching a prefix.
 * @replit/database v3 returns an object keyed by all matching keys.
 * This helper normalises to an array of key strings.
 */
export async function listKeys(prefix: string): Promise<string[]> {
  const client = getDb();
  // The list method returns keys as an array
  const result = await client.list(prefix);
  const r = result as unknown;
  if (Array.isArray(r)) {
    return r as string[];
  }
  // Some versions return an object
  if (typeof r === 'object' && r !== null) {
    return Object.keys(r as Record<string, unknown>);
  }
  return [];
}
