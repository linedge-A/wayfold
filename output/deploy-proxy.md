# Deploy Runbook — Wayfold Gemini Proxy

Standalone deploy of the keyed Gemini proxy (`server.ts` + `server-security.ts`).
The free-tier SPA can be served statically from anywhere; this service holds the
secret keys and enforces the per-IP cost wall.

> **Human-gated.** The deploy target, the cloud project, and the live secret keys
> are the owner's to choose and provide. The steps below are ready to run; nothing
> here has been deployed.

---

## What this image is

`Dockerfile` builds a combined image: the bundled Express server (`dist/server.cjs`)
**plus** the built SPA (`dist/`). At runtime the server auto-detects `dist/index.html`:

- present → serves SPA **and** API on one origin (simplest single-service deploy).
- absent → runs as a **pure API proxy** (front the SPA from a CDN; point it here with
  `VITE_API_BASE`).

Either way the proxy holds the keys; the browser never sees them.

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | **secret** | Gemini access (server-only) |
| `GEMINI_FLASH_MODEL` | env | model override (default `gemini-flash-latest`) |
| `CORS_ALLOWED_ORIGINS` | env | comma-separated origins allowed to call `/api` cross-origin (the SPA's CDN origin). Same-origin needs none. |
| `API_AUTH_TOKEN` | secret (optional) | shared-token gate on `/api/copilot` + `/api/ingest` |
| `PORT` | injected | Cloud Run sets this (default 8080); the server reads it |

`GOOGLE_MAPS_PLATFORM_KEY` is a **client** key (referrer-restricted in GCP); it is
NOT needed by the proxy and must not be a server secret here.

## Per-IP rate limits (the cost wall)

Already enforced by `server-security.ts` — no config needed:
- `/api` general: **90 req/min/IP**
- `/api/copilot` + `/api/ingest`: **20 req/min/IP**

Over the cap → `429 { error:'rate_limited', scope:'ip', retryAfterSec }` + `Retry-After`.
The front-end reads this to show its "busy — try again shortly" state.

> Note: the limiter is **in-memory per instance**. With more than one instance the
> effective cap is `limit × instances`. For a single-instance free-tier proxy this is
> fine. If you scale out and want a strict global cap, move the counter to a shared
> store (Redis / Cloudflare KV) — a later task.

---

## Option A — Google Cloud Run (recommended)

Scales to zero, generous free tier, consolidates billing with the Gemini/Maps keys.

```bash
# 0) one-time: pick project + enable APIs
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

# 1) store the Gemini key as a secret (do NOT bake it into the image)
printf '%s' 'YOUR_REAL_GEMINI_KEY' | gcloud secrets create gemini-api-key --data-file=-
# (optional token gate)
printf '%s' 'YOUR_SHARED_TOKEN' | gcloud secrets create api-auth-token --data-file=-

# 2) build + push the image (Cloud Build)
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/wayfold-proxy

# 3) deploy
gcloud run deploy wayfold-proxy \
  --image gcr.io/YOUR_PROJECT_ID/wayfold-proxy \
  --region YOUR_REGION \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-env-vars "GEMINI_FLASH_MODEL=gemini-flash-latest,CORS_ALLOWED_ORIGINS=https://YOUR_SPA_ORIGIN" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest"
  # add: --set-secrets "API_AUTH_TOKEN=api-auth-token:latest"   # if using the token gate
```

`--max-instances 1` keeps the in-memory rate limiter authoritative and caps cost.
Raise it only if you accept `limit × instances` or move to a shared counter.

The command prints the service URL. If you serve the SPA separately, set
`VITE_API_BASE=<that URL>` at the SPA's build time and add the SPA origin to
`CORS_ALLOWED_ORIGINS`.

## Option B — Fly.io

```bash
fly launch --no-deploy            # generates fly.toml; set internal_port = 8080
fly secrets set GEMINI_API_KEY=YOUR_REAL_GEMINI_KEY
fly secrets set CORS_ALLOWED_ORIGINS=https://YOUR_SPA_ORIGIN
fly deploy
```

## Option C — Render / Railway

Point the service at this repo, Dockerfile build. Add `GEMINI_API_KEY` (+ optional
`API_AUTH_TOKEN`, `CORS_ALLOWED_ORIGINS`) as env/secret in the dashboard. Both inject
`PORT` automatically.

---

## Smoke test after deploy

```bash
BASE=https://your-deployed-url

curl -s "$BASE/healthz"                       # → {"ok":true,"service":"wayfold-proxy"}

curl -s -X POST "$BASE/api/copilot" \
  -H 'Content-Type: application/json' \
  -d '{"query":"lighten day 1","appState":{}}' | head -c 200   # → 200 JSON

# IP cap: fire >20 in a minute → expect 429 scope:ip
for i in $(seq 1 25); do \
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/copilot" \
    -H 'Content-Type: application/json' -d '{"query":"hi","appState":{}}'; done | tail -6
```

---

## ⚠️ Owner action — rotate previously-committed keys

Keys committed to `.env.example` history earlier (Gemini, Maps) are in the git
history and must be **rotated** in the respective consoles, and the Maps key
**referrer-restricted** to the SPA origin in the GCP console. Out of this task's
scope, but required before any public deploy.
