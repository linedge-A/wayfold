# backend-core — one identical backend, shared with FirstStep

Decision record. Wayfold and FirstStep share the **same backend**, authored once, deployed to each
app's **own Firebase project**. Goal: lowest fixed cost + lowest maintenance. (Mirror of FirstStep's
`docs/backend-core.md`.)

## The split

```
backend-core            ← IDENTICAL across apps
  server-core.ts          createApp(config): Express  — json limit, security headers, CORS
                          allowlist, per-IP rate-limit + token gate, Gemini client, /healthz
                          attachSpa(app)              — local dev (Vite) / combined container only
  server-security.ts      headers / CORS / rate-limit / token gate (CSP origins via env)
  functions/index.ts      onRequest(createApp(cfg))   — the deploy entry

domain pack             ← the ONLY app-specific code
  server-domain.ts        wayfoldConfig: BackendConfig — the travel copilot (booking ingestion,
                          guarded URL place-extraction, Gemini itinerary edits) + /api/ingest*
  server.ts               thin local-dev / combined entry (createApp + attachSpa + listen)
```

`createApp(config)` is byte-identical to FirstStep's. Wayfold supplies only `wayfoldConfig`.

## Deploy = all on Firebase, one command

```
Hosting     → serves the built SPA, rewrites /api/** → the `api` Function
Functions   → the Gemini proxy (createApp), Gen2, minInstances:0 → scale-to-zero
```
`firebase deploy` ships it. No Docker, no separate Cloud Run service.

## Fixed cost ≈ $0

Functions `minInstances:0` (scale-to-zero, $0 idle) + Hosting free tier. Blaze (pay-as-you-go) is
required for Functions but has no monthly fee. The only thing that adds fixed cost is
`minInstances ≥ 1` — we don't (trade: ~1–3s cold start). Gen2 is Cloud Run underneath, so compute
cost is identical to a container; the win is operational (one platform, one deploy, one bill).

## Per-app config (env only)

- `GEMINI_API_KEY` (Secret Manager), `GEMINI_FLASH_MODEL`, `CORS_ALLOWED_ORIGINS`, `API_AUTH_TOKEN`.
- **`CSP_SCRIPT_SRC=https://maps.googleapis.com`** — Wayfold's only CSP extension (Maps JS). The
  shared `connect-src` baseline `https://*.googleapis.com` already covers Maps/Places APIs, so no
  `CSP_CONNECT_SRC` is needed. `img-src https:` already covers map tiles.

## Not in this PR (next step)

The **Firebase client layer** — anon auth + the `workspaces/{wsId}` collab data layer + the
workspace adapter + Firestore rules — is the co-planning slice, mirroring FirstStep #1/#2. This PR
rationalizes only the **server/deploy** layer. When the client layer lands, add the `firestore`/
`storage` blocks to `firebase.json`.

## Deploy-pending (need the live project)

- Functions + Firestore-rules emulator verification needs the project (+ Java for the Firestore
  emulator). Verified here at the **local Express layer** (createApp behavior-identical: `/healthz`
  `service:wayfold`, copilot `lighten`/ingest routes, 429 contract).
- Long-term: lift `server-core` + the client `cloud-core` into a shared package/monorepo so it's a
  single source instead of a verbatim copy across the two repos.
