// ─────────────────────────────────────────────────────────────────────────────
// SCC Office Dashboard — Express Application Entry Point
// ─────────────────────────────────────────────────────────────────────────────

// Config is validated before anything else — app exits if config is invalid.
import { config } from './config';

import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/auth';

// Routes
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import agentsRouter from './routes/agents';
import costsRouter from './routes/costs';
import feedRouter from './routes/feed';

// Integrations
import { startCostPoller } from './integrations';

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Frontend served separately
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
//
// Production: locked to the specific ALLOWED_ORIGIN deployment URL.
// Broad wildcard patterns (*.replit.app) are intentionally avoided — Replit
// hosts thousands of public projects on that domain; any of them could be used
// to make credentialed requests to the dashboard if we accepted the wildcard.
//
// Development: localhost origins are allowed for local dev convenience.

const allowedOrigin =
  config.NODE_ENV === 'production'
    ? config.ALLOWED_ORIGIN ?? null
    : null; // Handled by the dev regex below

const devOriginPatterns = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.replit\.dev(:\d+)?$/,
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, Replit shell, Postman)
      if (!origin) return callback(null, true);

      if (config.NODE_ENV === 'production') {
        if (allowedOrigin && origin === allowedOrigin) {
          return callback(null, true);
        }
        return callback(new Error(`CORS: origin '${origin}' not allowed`));
      }

      // Development — allow localhost/127.0.0.1
      const allowed = devOriginPatterns.some((p) => p.test(origin));
      if (allowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true, // Required for HTTP-only cookie to be sent
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
  }),
);

// ─── Body parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10kb' })); // Small limit — API only receives auth payloads
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// ─── General rate limiter ─────────────────────────────────────────────────────

app.use('/api', apiRateLimiter);

// ─── Trust proxy (Replit sits behind a reverse proxy) ─────────────────────────

app.set('trust proxy', 1);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/costs', costsRouter);
app.use('/api/feed', feedRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'The requested endpoint does not exist.' },
  });
});

// ─── Centralised error handler ────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = config.PORT;

app.listen(PORT, () => {
  console.log(`[server] SCC Office Dashboard API running on port ${PORT}`);
  console.log(`[server] Environment: ${config.NODE_ENV}`);
  console.log(`[server] Health: http://localhost:${PORT}/api/health`);

  // ── Start the cost poller ────────────────────────────────────────────────
  // startCostPoller() is async — it restores persisted lastPollMs from Replit
  // DB before the first cycle to prevent double-counting on cold starts.
  // The poller runs independently of the HTTP server. A startup failure here
  // is logged but does not prevent the API from serving requests.
  startCostPoller()
    .then(() => {
      console.log('[server] Cost poller started');
    })
    .catch((err) => {
      console.error('[server] Failed to start cost poller:', err instanceof Error ? err.message : String(err));
      console.error('[server] Dashboard will serve stale/empty cost data until poller recovers on restart');
    });
});

export default app;
