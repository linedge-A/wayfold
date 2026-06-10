/**
 * End-to-end harness for the copilot+ingestion engine.
 * Run: node_modules/.bin/tsx modules/copilot/run-engine.ts
 *
 * Proves the wiring the task asked for:
 *   1) reads the REAL /AGENTS.md → UserPreferences (user memory)
 *   2) ingests a blog blurb → Pocket candidates WITH evaluation signals
 *   3) runs the optimizer over an itinerary, honouring those prefs → schedule + deltas
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAgentsMd, interestBoost } from './userPreferences';
import { getLocalCopilotResponse } from './localResponses';
import { ingestLinks, optimizeItinerary } from './copilotEngine';

const line = (s = '') => console.log(s);
const H = (s: string) => line(`\n══ ${s} ══`);

// ── 1) USER MEMORY from the real AGENTS.md ─────────────────────────────────
H('1) AGENTS.md → user preferences');
const agentsMd = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf8');
const prefs = parseAgentsMd(agentsMd);
line(`  pacing            = ${prefs.pacing}`);
line(`  interests         = ${prefs.interests.join(', ')}`);
line(`  avoidBacktracking = ${prefs.avoidBacktracking}`);
line(`  draftToPocketFirst= ${prefs.draftToPocketFirst}`);

// ── 2) INGESTION: a saved blog → candidates with signals ────────────────────
H('2) Ingest a blog blurb → Pocket candidates (with evaluation signals)');
const blog = `
A Perfect Day in Kyoto — my saved notes (https://example.com/kyoto-eats)
Nishiki Market is a must-visit for lunch; get there before the crowds, it's open 9 AM - 6 PM.
Don't miss Kiyomizu-dera early in the morning — the view at sunrise is breathtaking.
For dinner, Pontocho Alley comes alive at night with tiny izakaya and lantern-lit stalls.
Yasaka Pagoda is a lovely quick photo lookout on the walk between them.
Honestly, Kyoto Tower is overrated and touristy — I'd skip it.
We also loved a tiny kissaten for morning coffee near Marutamachi.
`;
const ing = ingestLinks(blog, 'blog', prefs, 'Kyoto');
line('  ' + ing.message);
line('  — candidates —');
for (const c of (ing.suggestion?.itemsToAdd || []) as any[]) {
  const s = c.signals || {};
  line(`   • ${c.title.padEnd(20)} ${String(c.category).padEnd(6)} verdict=${s.verdict ?? '—'} best=${s.bestTime ?? '—'} tags=[${(c.tags || []).join(',')}]${c.openingHours ? ` open ${c.openingHours}` : ''}`);
}

// confirm verdict:skip (Kyoto Tower) was filtered out of the import set
const titles = (ing.suggestion?.itemsToAdd || []).map((c: any) => c.title);
line(`  → Kyoto Tower excluded from import set? ${!titles.some(t => /kyoto tower/i.test(t)) ? 'YES (verdict:skip)' : 'NO'}`);

// ── 3) INTEREST BOOST sanity ────────────────────────────────────────────────
H('3) Interest boost reflects AGENTS.md');
for (const c of (ing.suggestion?.itemsToAdd || []) as any[]) {
  line(`   ${c.title.padEnd(20)} boost=+${interestBoost(c, prefs.interests)}`);
}

// ── 4) OPTIMIZER over an itinerary, honouring prefs ─────────────────────────
H('4) Optimize an itinerary with the engine (AGENTS.md prefs applied)');
const days = [{ id: 'day-1' }];
const items: any[] = [
  { id: 'lunch', title: 'Kaiseki Lunch (reserved)', category: 'food', area: 'Gion', dayId: 'day-1', lat: 35.0036, lng: 135.7750, startTime: '12:30 PM', endTime: '02:00 PM', pinState: 'hard', reservationBound: true },
  { id: 'kiyomizu', title: 'Kiyomizu-dera', category: 'sight', area: 'Higashiyama', dayId: 'day-1', lat: 34.9949, lng: 135.7850, priority: 'high', pinState: 'none', estimatedDurationMin: 90, ticketed: true, queueMin: 15, signals: { bestTime: 'early morning', verdict: 'must' }, tags: ['zen', 'architecture'] },
  { id: 'nishiki', title: 'Nishiki Market', category: 'food', area: 'Central', dayId: 'day-1', lat: 35.0050, lng: 135.7649, priority: 'medium', pinState: 'none', estimatedDurationMin: 60, openingHours: '9 AM - 6 PM', tags: ['food-market'] },
  { id: 'pontocho', title: 'Pontocho Night Stalls', category: 'food', area: 'Central', dayId: 'day-1', lat: 35.0042, lng: 135.7706, priority: 'medium', pinState: 'none', estimatedDurationMin: 75, openingHours: '6 PM - 11 PM', signals: { bestTime: 'night' }, tags: ['food-market', 'nightlife'] },
  { id: 'yasaka', title: 'Yasaka Pagoda Lookout', category: 'sight', area: 'Higashiyama', dayId: 'day-1', lat: 34.9985, lng: 135.7806, stopClass: 'corridor', pinState: 'none', priority: 'low', estimatedDurationMin: 15, tags: ['scenic'] },
];
const opt = optimizeItinerary(days, items, prefs);
line('  ' + opt.message);
line('  — schedule —');
for (const s of (opt.updatedItems || []).filter(i => i.startTime)) {
  line(`   ${s.startTime}–${s.endTime}  ${s.title}`);
}
line('  — deltas —');
for (const d of opt.deltas || []) line(`   [${d.type}] ${d.itemTitle} ${d.from ?? ''}${d.to ? ' → ' + d.to : ''}`);

// ── 5) Through the actual copilot entry point (App's call path) ─────────────
H('5) Through getLocalCopilotResponse (the real App fallback path)');
line('  cmd "optimize my day":');
const viaCmd = getLocalCopilotResponse('optimize my day', days, items, prefs);
line('    ' + viaCmd.message);
line('  cmd = pasted blog link:');
const viaPaste = getLocalCopilotResponse('Check this out https://example.com/kyoto-eats Nishiki Market is a must for lunch, open 9 AM - 6 PM.', days, items, prefs);
line('    ' + viaPaste.message);
line(`    suggestion.itemsToAdd = ${viaPaste.suggestion?.itemsToAdd?.length ?? 0} item(s)`);

line('\nDONE');
