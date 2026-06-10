# Coordination Note — Copilot↔Optimizer wiring vs. planner consolidation

> **Owner:** copilot + ingestion lane (Agent 6 / Agent 5 scope)
> **Audience:** Agent 0 (merge owner), Agent 7 (constraint-engine)
> **Status:** OPEN — needs merge sequencing decision. Transient note; remove once resolved.
> **Raised:** 2026-06-10

Per `agent.md` Rule 2 (contract change requires notice) and Rule 4 (one owner per
merge train). No code changed by this note — it only flags a collision between two
in-flight changes that touch the same files.

---

## The collision

Two changes modify the same copilot/optimizer surface in **incompatible** ways:

**(A) Already on `main`** (tip `4711aba`) — copilot is wired to the real optimizer:
- `modules/copilot/localResponses.ts` delegates to `modules/copilot/copilotEngine.ts`
  (new signature, optional `prefs` arg).
- `copilotEngine.ts` imports the planner from `modules/generator/planner.ts` and the
  ingestion pipeline from `modules/ingestion/extractCandidates.ts`.
- `modules/copilot/userPreferences.ts` reads `/AGENTS.md` → planner `brief.interests` +
  `brief.keepAll`.
- Net effect on `main`: copilot commands ("optimize", "lighten", pasted blog/link) run
  the deterministic engine and honour AGENTS.md memory.

**(B) Pending — `origin/agent/constraint-engine-polish` (Agent 7), NOT yet merged:**
- Relocates the planner: `modules/generator/planner.ts` → `modules/constraint-engine/planner.ts`
  (also moves `run-planner.ts`, `test-rules.ts`; adds `primitives.ts`). **Deletes `modules/generator/`.**
- Reverts `modules/copilot/localResponses.ts` to the **old keyword-stub** version
  (removes the `copilotEngine` import — i.e. **un-wires the optimizer from the copilot**).
- Deletes `modules/copilot/copilotEngine.ts`, `userPreferences.ts`, `run-engine.ts`,
  and `modules/ingestion/extractCandidates.ts`.

If (B) merges onto (A) as-is, the copilot regresses to stubs and the ingestion pipeline
is removed.

## What's actually in conflict vs. compatible

- ✅ **Planner relocation is fine / arguably correct.** `generator` is not in the
  `agent.md` folder map; `constraint-engine` (Agent 7) is the official home. No objection
  to the planner living at `modules/constraint-engine/planner.ts`.
- ❌ **Un-wiring the copilot is the regression.** Reverting `localResponses.ts` to keyword
  stubs and deleting `copilotEngine` / `userPreferences` / `extractCandidates` drops the
  optimizer↔copilot integration and AGENTS.md-memory wiring that already shipped to `main`.

## Recommended resolution (cheap, keeps both)

1. Keep Agent 7's planner move to `modules/constraint-engine/planner.ts`.
2. **Keep** `modules/copilot/copilotEngine.ts`, `userPreferences.ts`, and
   `modules/ingestion/extractCandidates.ts` (do not delete).
3. Change **one import** in `copilotEngine.ts`:
   `from '../generator/planner'` → `from '../constraint-engine/planner'`.
4. Keep the engine-wired `localResponses.ts` from `main` (do not revert to stubs).
5. Ensure `brief.interests` and `brief.keepAll` survive in the consolidated planner
   (additive, optional — see `main`'s `planner.ts`).

## Suggested merge order (Agent 0)

Rebase `agent/constraint-engine-polish` on current `main` and resolve `localResponses.ts`
in favour of `main`'s engine-wired version, applying steps 2–5 above, **before** merge.
That yields: planner consolidated under `constraint-engine` **and** copilot still wired.

## Affected files

| File | (A) on main | (B) Agent 7 branch |
| --- | --- | --- |
| `modules/generator/planner.ts` | present | deleted (moved) |
| `modules/constraint-engine/planner.ts` | — | added |
| `modules/copilot/localResponses.ts` | engine-wired | reverted to stubs |
| `modules/copilot/copilotEngine.ts` | present | deleted |
| `modules/copilot/userPreferences.ts` | present | deleted |
| `modules/ingestion/extractCandidates.ts` | present | deleted |
| `modules/copilot/run-engine.ts` | present | deleted |
