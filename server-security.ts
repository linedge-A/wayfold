/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lightweight, dependency-free server hardening — security headers, a per-IP rate limiter, a CORS
 * allowlist, and an optional shared-token gate. Closes the open-LLM-proxy / DoS / header gaps from
 * the security review without adding dependencies. For a production deployment, swapping these for
 * `helmet` + `express-rate-limit` is a reasonable upgrade.
 *
 * All of it is OPT-IN-safe: with no env vars set, only the (harmless) security headers + rate limit
 * apply, so the local demo is unchanged. Set API_AUTH_TOKEN / CORS_ALLOWED_ORIGINS to lock down.
 */
import type { Request, Response, NextFunction } from 'express';

/** Standard security headers. CSP is production-only (Vite dev needs inline/eval for HMR). Each
 *  directive has a Firebase-app baseline (Firebase SDK over *.googleapis.com / *.firebaseio.com,
 *  Google Fonts, https: tiles/images) that BOTH apps share, plus an optional per-app extension via
 *  env (CSP_SCRIPT_SRC / CSP_CONNECT_SRC / …) — e.g. Wayfold adds Google Maps origins. This keeps
 *  server-security.ts byte-identical across apps; only the env differs. */
function directive(name: string, base: string, envKey: string): string {
  const extra = (process.env[envKey] || '').trim();
  return extra ? `${name} ${base} ${extra}` : `${name} ${base}`;
}
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      directive('script-src', "'self'", 'CSP_SCRIPT_SRC'),
      directive('connect-src', "'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com", 'CSP_CONNECT_SRC'),
      directive('img-src', "'self' data: blob: https:", 'CSP_IMG_SRC'),
      directive('style-src', "'self' 'unsafe-inline' https://fonts.googleapis.com", 'CSP_STYLE_SRC'),
      directive('font-src', "'self' https://fonts.gstatic.com", 'CSP_FONT_SRC'),
      "frame-ancestors 'none'",
    ].join('; '));
  }
  next();
}

/** CORS allowlist. The same-origin SPA needs no CORS; the extension POSTs cross-origin. Only origins
 *  listed in CORS_ALLOWED_ORIGINS (comma-separated, e.g. a chrome-extension://<id>) get ACAO; all
 *  other cross-origin callers get no allow header (browser blocks the response read). */
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
);
export function corsAllowlist(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
}

/** Fixed-window in-memory rate limiter, keyed by client IP. Returns 429 over the cap. */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let e = hits.get(key);
    if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + windowMs }; hits.set(key, e); }
    e.count++;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - e.count)));
    if (e.count > max) {
      const retryAfterSec = Math.ceil((e.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      // Machine-readable cap contract the client reads to show the "busy — try again
      // shortly" state (distinct from the front-end per-session pacing cap). `scope:'ip'`
      // marks this as the real per-IP cost wall. `message` keeps a human-readable string.
      res.status(429).json({ error: 'rate_limited', scope: 'ip', retryAfterSec, message: 'Too many requests — please slow down.' });
      return;
    }
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k); // opportunistic GC
    next();
  };
}

/** Optional shared-token gate. If API_AUTH_TOKEN is set, the guarded routes require it (closes the
 *  unauthenticated-LLM-proxy hole); if unset, requests pass (local demo). Replace with real
 *  per-user auth before any multi-tenant deployment. */
export function requireApiToken(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.API_AUTH_TOKEN;
  if (!token) { next(); return; } // demo mode — no token configured
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers['x-api-token'] || '');
  if (got && got === token) { next(); return; }
  res.status(401).json({ error: 'Unauthorized.' });
}
