// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Alert Service
// Sends Telegram messages to Harvey when budget thresholds are crossed.
// Deduplication: once per threshold crossing per calendar month.
// ─────────────────────────────────────────────────────────────────────────────

import { config } from '../config';

// Budget threshold labels for human-readable messages
const THRESHOLD_LABELS: Record<number, string> = {
  40000: '$400',
  47500: '$475',
  50000: '$500',
};

// Alert level descriptions
const THRESHOLD_LEVEL: Record<number, string> = {
  40000: '⚠️ Amber Warning',
  47500: '🔴 Red Warning',
  50000: '🚨 Critical — Budget Cap Reached',
};

async function sendTelegramMessage(text: string): Promise<boolean> {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = config;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    // Telegram not configured — silently skip
    return false;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[alertService] Telegram API error ${response.status}: ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[alertService] Failed to send Telegram message: ${message}`);
    return false;
  }
}

/**
 * Send a budget threshold alert to Harvey via Telegram.
 *
 * @param thresholdCents - The threshold that was crossed (in cents)
 * @param currentSpendCents - The current monthly spend (in cents)
 * @returns true if the message was sent successfully
 */
async function sendBudgetAlert(
  thresholdCents: number,
  currentSpendCents: number,
): Promise<boolean> {
  const label = THRESHOLD_LABELS[thresholdCents] ?? `$${(thresholdCents / 100).toFixed(2)}`;
  const level = THRESHOLD_LEVEL[thresholdCents] ?? '⚠️ Budget Alert';
  const currentDollars = (currentSpendCents / 100).toFixed(2);
  const budgetDollars = '500.00';
  const remaining = ((50000 - currentSpendCents) / 100).toFixed(2);
  const now = new Date();
  const monthName = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const text = [
    `${level}`,
    ``,
    `<b>SCC AI Budget — ${monthName}</b>`,
    ``,
    `Monthly spend has crossed the <b>${label}</b> threshold.`,
    ``,
    `📊 Current spend: <b>$${currentDollars}</b>`,
    `💰 Budget cap: <b>$${budgetDollars}</b>`,
    `🔋 Remaining: <b>$${remaining}</b>`,
    ``,
    `Review agent activity on the SCC Office Dashboard.`,
  ].join('\n');

  return sendTelegramMessage(text);
}

/**
 * Send a plain-text message to Harvey's Telegram.
 * Used for system notifications beyond budget alerts.
 */
async function sendMessage(text: string): Promise<boolean> {
  return sendTelegramMessage(text);
}

export const alertService = {
  sendBudgetAlert,
  sendMessage,
};
