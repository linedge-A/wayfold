# Merge Checklist — Wayfold

## Purpose

This document defines branch readiness and integration checks for the MVP.

---

## PR checklist

- Scope matches owned module.
- Shared contracts were not changed silently.
- Design tokens were not forked.
- `PlanChip` was not duplicated.
- Screens or states affected are shown in screenshots or notes.
- Tests or smoke checks were run.
- Seed data still matches canonical trip.

---

## Integration checklist

- App shell composes modules without layout break.
- Itinerary and pocket use the same chip family.
- Map highlights selected chip correctly.
- Revision summary shows concise deltas.
- Hard-pinned items resist invalid moves.
- Booking confirmations map to linked items.

---

## Merge order

1. design system
2. contracts
3. trip brief
4. itinerary
5. pocket
6. copilot
7. map
8. constraint engine
9. booking
10. final integration
