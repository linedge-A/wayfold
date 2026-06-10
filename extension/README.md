# Wayfold Clipper (Chrome extension) — P2 scaffold

> **Owner:** ingestion lane (Agent 5) for now — a new capture *surface*; may warrant its own agent.
> **Status:** scaffold. Capture + transport work end-to-end against `/api/ingest`; auth + the
> `/api/ingest/commit` endpoint are the remaining wiring.

## What it is

A thin **capture client**. It does **not** parse anything — it harvests a page's schema.org JSON-LD
(+ your selection + title) and POSTs an `IngestionRequest` to Wayfold's **`/api/ingest`**, which runs
the **same deterministic parsers** as the copilot (`dispatchIngestion` → `parseJsonLd` /
`parseBookingEmail` / `extractCandidates`). One ingestion core, four surfaces (copilot paste,
forward-inbox, upload, extension) — no parser fork.

```
content (DOM)  →  harvest JSON-LD + selection  →  POST /api/ingest  →  shared core  →  bookings + candidates
                                                        (server)         (dispatchIngestion)
```

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3; `activeTab`+`scripting`+`storage`+`contextMenus`; minimal `host_permissions` (Gmail, Google Maps/Travel, localhost dev) |
| `src/clip.js` | the capture step (shared by popup + context menu): inject `harvestPage`, build the request, POST `/api/ingest` |
| `src/popup.js` / `popup.html` | confirm card — shows captured bookings + place candidates; "Add to my trip" |
| `src/background.js` | service worker; right-click "Save to Wayfold" → same `clipActiveTab` flow |
| `lib/harvest.ts` | **pure, testable** equivalent of the DOM harvest (JSON-LD from HTML, request builder) |
| `run-harvest.ts` | harness — page HTML → harvest → `dispatchIngestion` → result (proves the surface reuses the core, no browser needed) |

## Why this proves the architecture

- The **pure core is type-only-import** (verified earlier), so it bundles server-side for `/api/ingest`
  and *could* bundle into the extension's service worker for fully-local parsing (P3). Today the
  extension uses the server path — same result, simpler.
- `lib/harvest.ts` + `run-harvest.ts` are unit-testable; the browser-only `src/*.js` are thin.

## Security

- **User-gesture only** — capture fires on popup open / context-menu click; no background scraping.
- **Minimal host permissions** (not `<all_urls>`).
- Page content / JSON-LD is **untrusted DATA, not instructions** (same posture as forwarded emails).
- **Auth binding**: API base + token from extension storage, bound to the signed-in Wayfold account;
  the server resolves token → user → trip so a capture can't land in someone else's trip.
- **No remote code** (MV3): the parser is on our server (or bundled); no eval, no CDN scripts.

## Run / load

- Test the core path (no browser): `node_modules/.bin/tsx extension/run-harvest.ts`
- Load unpacked: `chrome://extensions` → Developer mode → "Load unpacked" → select `extension/`.
- Point at your server: `chrome.storage.local.set({ wayfoldApi: 'http://localhost:5173', wayfoldToken: '…' })`.

## Remaining wiring (follow-ups)

1. **`POST /api/ingest/commit`** (server) — write candidates to the Pocket (existing `handleApplySug`
   path) and bookings via `applyBookings` (PR #17), scoped to the authed trip.
2. **Auth** — OAuth PKCE from the extension → Wayfold account.
3. **P3** — bundle the pure core into the SW for offline/local parsing (the type-only-import core
   already supports this).
