# Coordination Note — add `'pocket'` to `AppState.currentView`

> **Owner of the request:** pocket/map lane (Agent 5 / Agent 4 scope)
> **Approval owner:** **Agent 9** (shared contracts) · cc Agent 0 (shell/nav)
> **Status:** OPEN — needs Agent 9 sign-off before the field is added. Transient note; remove once merged.
> **Raised:** 2026-06-10

Per `agent.md` Rule 2 (contract change requires notice). **No contract code is changed by this note** — it requests approval to make the change. Implementation of the new page is blocked on this.

---

## Proposed change (additive)

A new **Pocket Board** page (the Plan workspace minus the calendar: reused `MapPanel` + `PocketPanel` with their existing filter/search/group/relevance controls) needs a nav destination. The app routes top-level views off `AppState.currentView`, so the page needs a 4th value.

**Old** (`shared/types/index.ts`):
```ts
currentView: 'plan' | 'trips' | 'explore';
```
**Proposed:**
```ts
currentView: 'plan' | 'trips' | 'explore' | 'pocket';
```

Same one-line widening in the mirrored prop union in `app-shell/TopHeader.tsx` (`currentView` / `onViewChange`), and `output/contracts.md` updated alongside.

## Why this is safe

- **Purely additive.** Every existing producer/consumer of `currentView` keeps working; nothing switches on an exhaustive union today that would break (the App render chain is `trips? : explore? : (plan)`, a new branch slots in cleanly).
- **No new state, no new events.** It's one more value of an existing field.
- **No parallel nav system.** The alternative — a separate local UI flag for the page — was rejected precisely because it would duplicate the `currentView` routing (anti-pattern per `agent.md`).

## Affected agents / files (on approval)

| File | Owner | Change |
|---|---|---|
| `shared/types/index.ts` | **Agent 9** | `currentView` union += `'pocket'` |
| `output/contracts.md` | Agent 9 | document the new value |
| `app-shell/TopHeader.tsx` | Agent 0 | widen prop union; the existing **"Folder"** nav item points to `'pocket'` (per product decision), "Plan new trip" stays a button |
| `app-shell/App.tsx` | Agent 0 | render branch: `currentView === 'pocket'` → `<PocketBoardPage>` |
| `app-shell/PocketBoardPage.tsx` *(new)* | Agent 0/5 | composition only — reuses `MapPanel` + `PocketPanel`; no contract surface |

## Scope guardrails (so the field doesn't grow meaning later)

- Page is **composition only** — reuses the existing components as-is; if map prominence needs a small `MapPanel` prop, that's a separate Agent 4 change raised on its own.
- Copilot stays **plan-specific** — the page reserves a single "Ask Copilot" call-out, not the copilot rail; notes are not made global.

## Requested decision (Agent 9)

Approve `currentView += 'pocket'` (additive) so the Pocket Board page can be built on it. On 👍 I'll land the type + `contracts.md` in the same PR as the page, tagging you.
