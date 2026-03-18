// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Environment Configuration
// Validates all required env vars at startup. App refuses to start if missing.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z
    .string()
    .optional()
    .default('3000')
    .transform((v) => parseInt(v, 10)),

  // Auth — required
  DASHBOARD_PASSWORD_HASH: z
    .string()
    .min(1, 'DASHBOARD_PASSWORD_HASH is required'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters'),

  // OpenClaw logs — required
  OPENCLAW_LOG_PATH: z
    .string()
    .min(1, 'OPENCLAW_LOG_PATH is required')
    .default('/tmp/openclaw'),

  // Anthropic — optional (service degrades gracefully)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_INPUT_PRICE_PER_MILLION_TOKENS: z
    .string()
    .optional()
    .default('3.00')
    .transform((v) => parseFloat(v)),
  ANTHROPIC_OUTPUT_PRICE_PER_MILLION_TOKENS: z
    .string()
    .optional()
    .default('15.00')
    .transform((v) => parseFloat(v)),

  // Gemini pricing
  GEMINI_INPUT_PRICE_PER_MILLION_TOKENS: z
    .string()
    .optional()
    .default('0.075')
    .transform((v) => parseFloat(v)),
  GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS: z
    .string()
    .optional()
    .default('0.30')
    .transform((v) => parseFloat(v)),

  // Telegram — optional (alerts silently skipped if not configured)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // Replit DB — required for persistence
  REPLIT_DB_URL: z.string().url('REPLIT_DB_URL must be a valid URL').optional(),

  // CORS — required in production to lock the dashboard to its specific deployment URL.
  // Example: https://scc-office-dashboard.replit.app
  // In development, localhost origins are allowed automatically.
  ALLOWED_ORIGIN: z.string().url('ALLOWED_ORIGIN must be a valid URL').optional(),

  // Node env
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .optional()
    .default('production'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`[config] ❌ Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();

export type Config = typeof config;
