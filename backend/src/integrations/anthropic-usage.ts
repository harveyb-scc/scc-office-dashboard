// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Anthropic API Usage Client
//
// Optional enhancement: if ANTHROPIC_API_KEY is set, attempt to fetch
// org-level usage data from the Anthropic API to cross-check log-derived costs.
//
// Key design guarantees:
//   - Never throws. All errors result in null being returned.
//   - Returns null if ANTHROPIC_API_KEY is not configured.
//   - Returns null if the API endpoint is unavailable or returns unexpected data.
//   - The rest of the system never depends on this succeeding; log-based costs
//     are always the authoritative fallback.
//
// Anthropic API note (March 2026):
//   The Anthropic usage endpoint is not publicly documented as of this writing.
//   The implementation attempts /v1/usage first, then falls back gracefully.
//   If Anthropic publishes a billing API in future, extend getAnthropicUsage()
//   with the new endpoint — the interface contract here does not change.
//
// Exports:
//   getAnthropicUsage(): Promise<AnthropicUsageResult | null>
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

/** Normalised usage data returned from the Anthropic API (or null on failure). */
export interface AnthropicUsageResult {
  /** Input tokens consumed during the period. */
  inputTokens: number;
  /** Output tokens consumed during the period. */
  outputTokens: number;
  /** Model identifier if available. */
  model: string | null;
  /**
   * ISO 8601 end of the billing period this data covers.
   * Used to associate the usage with the correct UTC hour bucket.
   */
  periodEnd: string | null;
  /** The source from which this data was retrieved. */
  source: 'anthropic-api' | 'log-fallback';
}

// ─── Zod-lite validation (manual, no dependency) ─────────────────────────────

/**
 * Minimal runtime validation of the Anthropic API response shape.
 * We intentionally do not pull in Zod here to keep the integration layer
 * dependency-free — but we still validate before using any value.
 */
function isValidUsageResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  // Accept any shape that has numeric token counts somewhere
  if (typeof d.input_tokens === 'number' && typeof d.output_tokens === 'number') return true;
  if (typeof d.inputTokens === 'number' && typeof d.outputTokens === 'number') return true;

  // Nested usage object pattern
  if (d.usage && typeof d.usage === 'object') {
    const u = d.usage as Record<string, unknown>;
    if (typeof u.input_tokens === 'number' && typeof u.output_tokens === 'number') return true;
    if (typeof u.inputTokens === 'number' && typeof u.outputTokens === 'number') return true;
  }

  return false;
}

function extractTokensFromResponse(data: Record<string, unknown>): {
  inputTokens: number;
  outputTokens: number;
  model: string | null;
  periodEnd: string | null;
} {
  // Direct fields
  let inputTokens =
    (data.input_tokens as number | undefined) ??
    (data.inputTokens as number | undefined) ??
    0;
  let outputTokens =
    (data.output_tokens as number | undefined) ??
    (data.outputTokens as number | undefined) ??
    0;

  // Nested usage object
  if (inputTokens === 0 && outputTokens === 0 && data.usage && typeof data.usage === 'object') {
    const u = data.usage as Record<string, unknown>;
    inputTokens = (u.input_tokens as number | undefined) ?? (u.inputTokens as number | undefined) ?? 0;
    outputTokens = (u.output_tokens as number | undefined) ?? (u.outputTokens as number | undefined) ?? 0;
  }

  // Aggregate across a results array (some APIs return per-model breakdown)
  if (Array.isArray(data.results) || Array.isArray(data.data)) {
    const items = (data.results ?? data.data) as unknown[];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const i = item as Record<string, unknown>;
      inputTokens += (i.input_tokens as number | undefined) ?? (i.inputTokens as number | undefined) ?? 0;
      outputTokens += (i.output_tokens as number | undefined) ?? (i.outputTokens as number | undefined) ?? 0;
    }
  }

  const model =
    (data.model as string | undefined) ??
    (data.model_id as string | undefined) ??
    null;

  const periodEnd =
    (data.period_end as string | undefined) ??
    (data.end_time as string | undefined) ??
    (data.endTime as string | undefined) ??
    null;

  return { inputTokens, outputTokens, model, periodEnd };
}

// ─── HTTP fetch with timeout ──────────────────────────────────────────────────

/** Timeout for Anthropic API calls: 10 seconds per Dex's resilience standards. */
const REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Endpoint attempts ────────────────────────────────────────────────────────

/**
 * Attempt to fetch usage from a candidate Anthropic API endpoint.
 * Returns null if the endpoint returns a non-2xx status or an unexpected body.
 */
async function tryEndpoint(
  url: string,
  apiKey: string,
): Promise<AnthropicUsageResult | null> {
  let response: Response;

  try {
    response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  } catch (err) {
    // Network error, DNS failure, timeout, etc.
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[anthropic-usage] Request timed out (${REQUEST_TIMEOUT_MS}ms): ${url}`);
    } else {
      console.warn(`[anthropic-usage] Network error for ${url}:`, err instanceof Error ? err.message : String(err));
    }
    return null;
  }

  // 404: endpoint doesn't exist; 401/403: bad key; 429: rate limit
  if (!response.ok) {
    if (response.status !== 404) {
      // 404 is expected for endpoints we're probing — only log unexpected statuses
      console.warn(`[anthropic-usage] HTTP ${response.status} from ${url}`);
    }
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    console.warn(`[anthropic-usage] Non-JSON response from ${url}`);
    return null;
  }

  if (!isValidUsageResponse(body)) {
    console.warn(`[anthropic-usage] Unexpected response shape from ${url}`);
    return null;
  }

  const { inputTokens, outputTokens, model, periodEnd } = extractTokensFromResponse(
    body as Record<string, unknown>,
  );

  return {
    inputTokens,
    outputTokens,
    model,
    periodEnd: periodEnd ?? new Date().toISOString(),
    source: 'anthropic-api',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch current usage data from the Anthropic API.
 *
 * Returns null if:
 *   - ANTHROPIC_API_KEY environment variable is not set
 *   - All known endpoints are unavailable or return unexpected responses
 *   - Any network or parse error occurs
 *
 * Never throws.
 *
 * When null is returned, the caller should fall back to log-based cost calculation.
 */
export async function getAnthropicUsage(): Promise<AnthropicUsageResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Not configured — this is expected in dev/test environments
    return null;
  }

  // Candidate endpoints, tried in order.
  // The first one that returns a valid response wins.
  // Additional endpoints can be added here as Anthropic publishes their billing API.
  const candidateEndpoints = [
    'https://api.anthropic.com/v1/usage',
    'https://api.anthropic.com/v1/billing/usage',
  ];

  for (const url of candidateEndpoints) {
    try {
      const result = await tryEndpoint(url, apiKey);
      if (result) {
        return result;
      }
    } catch (err) {
      // Defensive: tryEndpoint should never throw, but catch here just in case
      console.warn(`[anthropic-usage] Unexpected error trying ${url}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // All endpoints failed — log-based data will be used
  return null;
}
