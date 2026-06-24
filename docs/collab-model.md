# collab-model — group co-planning client layer (scope)

Scope/design record for Wayfold's **paid-tier** group co-planning. Mirrors FirstStep's
`shared/lib` client layer (firebase init + anon auth + per-collection store adapters) but adds a
**shared, multi-member workspace** model (FirstStep's is per-uid personal).

Status: **NOT BUILT** — this doc scopes it. The server/deploy layer already exists
([backend-core.md](./backend-core.md)); this is the client + data layer that backend-core flagged
as "next step". Build stays gated (`firebaseEnabled=false` until `VITE_FIREBASE_*` is set), so the
current local-only app is unaffected until each phase is wired.

---

## Product shape (from project memory)

One trip, planned together: **shared itinerary + shared copilot chat**, but **personal pocket** per
member. A travel group (couple / friends / family) co-edits the same plan in real time; each person
keeps their own research stash.

The existing `app-shell/ShareModal.tsx` is a **social highlight-card exporter** (unrelated) — its
"Copy Share Link" is a mock. The real co-plan invite is a separate entry point (see Phase 3).

---

## Data model (Firestore)

Per-**item** docs (not one itinerary blob) so two editors never clobber the whole plan —
concurrency = last-write-wins per item, merged live by `onSnapshot`.

```
workspaces/{wsId}                     ← wsId is generated (NOT the uid; this is a SHARED space)
  { title, tripBrief, ownerUid, memberUids[], inviteCode, createdAt, updatedAt }
  /days/{dayId}                       ← SHARED  (calendar day groups)
  /itinerary/{itemId}                 ← SHARED  (the one itinerary; pin/lock = fields)
  /bookings/{bookingId}               ← SHARED  (locked anchors)
  /copilot/{msgId}                    ← SHARED  (chat + revision deltas, uid-attributed)
  /pockets/{uid}/items/{itemId}       ← PERSONAL (each member's research pocket)

users/{uid}
  { workspaceIds[] }                  ← membership index (discovery without a query)

invites/{code}                        ← { wsId, expiresAt }  public-read, resolves a join link
```

**Rules sketch** — `isMember(wsId)` = `request.auth.uid in get(workspaces/{wsId}).data.memberUids`.
- `workspaces/{wsId}` + shared subtrees: read/write require `isMember`.
- `pockets/{uid}/**`: read/write require `request.auth.uid == uid` (personal).
- `invites/{code}`: public read (to resolve a link); write only by a member of its wsId.
- `users/{uid}`: read/write self only.

---

## Client adapters (`shared/lib/`, mirror FirstStep)

Each store = **one interface, two backends** (local localStorage ⇄ cloud Firestore), placeholder-safe.

- `firebase.ts` — init from `VITE_FIREBASE_*`; `firebaseEnabled` gate; null exports → local mode.
- `auth.ts` — `ensureSignedIn()` anon-first (lazy, on first write); `getIdToken()`; `linkToGoogle()`.
- `workspace.ts` — `ensureWorkspace()`, `createInvite()`, `joinByCode()`, membership.
- `itineraryStore.ts` — `subscribeItinerary(cb)` (instant local paint → live `onSnapshot`),
  `upsertItem()`, `removeItem()`. Same pattern for `bookingsStore`, `daysStore`.
- `pocketStore.ts` — personal; reuse the existing `persistence.ts` `pocketKey` as the local cache.
- `copilotStore.ts` — `appendMessage()` + `subscribeChat(cb)` (shared, uid-attributed).

Subscription pattern (from FirstStep `shortlistStore.ts`): paint local cache immediately → sign in →
`ensureWorkspace` → migrate local → `onSnapshot` live, mirroring each update back to local cache.

---

## Server impact (small)
- `/api/copilot` stays stateless (generation only). The **client** writes the AI result into the
  shared itinerary + copilot collections, so collab is pure client+rules — no function rewrite.
- For attribution/abuse control later: pass `getIdToken()` and have the function `verifyIdToken`
  (Admin) to stamp the editor uid. Optional, Phase 4.

---

## Phased plan

1. **Foundation (ships dark).** Add `firebase` dep + `firebase.ts` + `auth.ts` (placeholder-safe).
   Add `firestore`/`storage` blocks to `firebase.json` + `firestore.rules`/`storage.rules`. No UI
   change; `firebaseEnabled=false` by default → local app identical. *Verifiable via emulator (Java).*
2. **Personal cloud workspace (single-user durability).** `workspace.ts` + `itineraryStore` +
   `pocketStore` with local⇄cloud mirroring; wire `App.tsx` to subscribe. Proves adapter + rules
   end-to-end before multi-user. (Same milestone FirstStep shipped first.)
3. **Invite / join = real collab.** `createInvite()`/`joinByCode()`, a "Co-plan" entry (link or
   code), `memberUids` add, multi-user live `onSnapshot` editing. Presence (who's online) optional.
4. **Shared copilot + attribution.** `copilotStore` shared chat; uid-stamped deltas; optional
   `verifyIdToken` on `/api/copilot`.
5. **Account linking (anon → Google).** Required before any paid subscription attaches to identity.

---

## Dependencies / blockers
- **Firebase project**: `wayfold-planner` must be on **Blaze** to deploy Functions + use Firestore
  in production. Local dev/rules-testing uses the emulator (needs **Java**).
- `firebase` client SDK is **not yet installed** (only `firebase-functions` in `functions/`).
- Long-term: lift `server-core` + this client layer into a shared package so it's one source across
  Wayfold + FirstStep instead of a verbatim copy.
