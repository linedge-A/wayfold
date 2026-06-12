/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Constraint-engine primitives facade. The clock / geo / opening-hours math now lives in the neutral
 * shared home (shared/utils/temporal, shared/utils/geo) so non-engine modules (trip-brief, ingestion)
 * can reuse it without importing engine internals (agent.md dependency rule). Re-exported here so the
 * existing engine imports (planner.ts, optimizer.ts) keep working unchanged. NO definitions live here
 * — this is purely the single re-export surface for the engine.
 */
export { parseClock, toMinutes, fromMinutes, fromMinutes24, parseHours, pad } from '../../shared/utils/temporal';
export { haversineKm } from '../../shared/utils/geo';
