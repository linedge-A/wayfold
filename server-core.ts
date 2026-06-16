/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * backend-core — the domain-agnostic backend, authored ONCE and shared by every app (FirstStep,
 * Wayfold, …). It owns the identical plumbing: body limits, security headers, CORS allowlist, the
 * per-IP rate-limit + optional token gate on the AI route, the Gemini client, and a liveness probe.
 * Each app supplies a thin `BackendConfig` (service name + its own route handlers); the only other
 * per-app variation is env (Firebase project, secrets, CSP_* origins — see server-security.ts).
 *
 * Deploy target = Firebase Functions Gen2 (onRequest(createApp(cfg)), minInstances:0 → scale-to-zero,
 * $0 idle). The SAME core also runs as a plain Node server for local dev / a combined container via
 * attachSpa(). Hosting serves the SPA in the Functions deploy, so the Function itself is API-only.
 */
import express, { type Express } from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { GoogleGenAI } from '@google/genai';
import { securityHeaders, corsAllowlist, rateLimit, requireApiToken } from './server-security';

export interface BackendConfig {
  /** Short service id surfaced at /healthz (e.g. 'firststep', 'wayfold'). */
  serviceName: string;
  /** Register the app's domain routes (copilot, ingest, …). `ai` is null when no GEMINI_API_KEY. */
  registerRoutes: (app: Express, ctx: { ai: GoogleGenAI | null }) => void;
  /** Per-IP caps per minute. Defaults: general 90, ai 20. */
  rateLimits?: { generalPerMin?: number; aiPerMin?: number };
  /** Paths that get the tighter AI cap + optional shared-token gate. Default ['/api/copilot']. */
  aiRoutePaths?: string[];
}

/** Build the Gemini client from the server key, or null (callers fall back to deterministic mode). */
function initGemini(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    console.log('GEMINI_API_KEY not set — running in deterministic (no-AI) mode.');
    return null;
  }
  try {
    return new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  } catch (err) {
    console.error('Gemini init failed:', err);
    return null;
  }
}

/**
 * Build the API Express app (no SPA serving — that's attachSpa, for local/combined only). Synchronous
 * so it drops straight into onRequest(). Wiring order is identical for every app.
 */
export function createApp(config: BackendConfig): Express {
  const app = express();
  const aiPaths = config.aiRoutePaths ?? ['/api/copilot'];
  const general = config.rateLimits?.generalPerMin ?? 90;
  const ai = config.rateLimits?.aiPerMin ?? 20;

  // Trust ONE proxy hop. On Functions Gen2 (Cloud Run behind Google's HTTPS LB) the socket peer is the
  // LB, so without this req.ip is the LB's address and the rate limiter would key every client to one
  // bucket (collective throttling). `1` trusts only the nearest proxy (the LB), reading the client IP
  // from the last X-Forwarded-For hop — not attacker-spoofable upstream entries.
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '256kb' }));            // bound request bodies
  app.use(securityHeaders);                             // nosniff / frame-deny / referrer / (prod) CSP
  app.use('/api', corsAllowlist);                       // cross-origin only for CORS_ALLOWED_ORIGINS
  app.use('/api', rateLimit({ windowMs: 60_000, max: general }));            // general per-IP cap
  app.use(aiPaths, rateLimit({ windowMs: 60_000, max: ai }), requireApiToken); // tighter cap + token gate

  // Liveness probe — outside /api so it is never rate-limited/token-gated, before any catch-all.
  app.get('/healthz', (_req, res) => { res.json({ ok: true, service: config.serviceName }); });

  config.registerRoutes(app, { ai: initGemini() });
  return app;
}

/**
 * Attach SPA serving for local dev (Vite middleware) or a combined deploy (static dist). NOT used in
 * the Functions deploy — Firebase Hosting serves the SPA there and the Function stays API-only.
 */
export async function attachSpa(app: Express): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
    console.log('Vite development middleware connected.');
    return;
  }
  const distPath = path.join(process.cwd(), 'dist');
  if (existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
    console.log('Serving combined SPA + API.');
  } else {
    console.log('No dist/ — running API-only.');
  }
}
