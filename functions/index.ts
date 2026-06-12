/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Firebase Functions Gen2 entry — the keyed proxy as ONE HTTPS function. Reuses backend-core's
 * createApp + the Wayfold domain pack verbatim (the Express app, minus SPA serving — Hosting serves
 * the SPA and rewrites /api/** here).
 *
 * Cost shape: minInstances:0 → scale-to-zero → $0 when idle (lowest-fixed-cost; cold starts are the
 * trade). maxInstances:1 keeps the in-memory rate limiter authoritative. The Gemini key is a Secret
 * Manager secret, never baked into the deploy.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createApp } from '../server-core';
import { wayfoldConfig } from '../server-domain';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

export const api = onRequest(
  { secrets: [GEMINI_API_KEY], minInstances: 0, maxInstances: 1, region: 'asia-east2', invoker: 'public' },
  createApp(wayfoldConfig),
);
