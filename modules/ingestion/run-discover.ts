/**
 * Harness for the pure AI-discovery parse/prompt (no live model call).
 * Run: node_modules/.bin/tsx modules/ingestion/run-discover.ts
 */
import { discoverySystemInstruction, parseDiscovery } from './discoverPlaces';

const line = (s = '') => console.log(s);
let pass = true;
const ok = (label: string, cond: boolean) => { line(`  ${cond ? '✓' : '✗'} ${label}`); if (!cond) pass = false; };

line('══ prompt ══');
line('  ' + discoverySystemInstruction('Paris', { count: 8, style: 'relaxing', interests: ['food-market', 'architecture'] }).split('\n')[0]);

line('\n══ parse a well-formed reply ══');
const good = `Here are some ideas:
[
  { "title": "Louvre Museum", "category": "sight", "area": "1st arr.", "tags": ["art","history"], "bestTime": "morning" },
  { "title": "Le Comptoir du Relais", "category": "food", "area": "Saint-Germain", "tags": ["bistro"] },
  { "title": "Louvre Museum", "category": "sight", "area": "1st", "tags": [] }
]`;
const p = parseDiscovery(good, 'Paris');
ok('parsed 2 (deduped the repeat Louvre)', p.length === 2);
ok('ids are destination+title scoped', p[0].id === 'place-disc-paris-louvre-museum');
ok('category preserved + bestTime → signals', p[0].category === 'sight' && p[0].signals?.bestTime === 'morning');
ok('food kept', p[1].category === 'food' && p[1].area === 'Saint-Germain');
ok('sourceType=ai + verdict recommended', p[0].sourceType === 'ai' && p[0].signals?.verdict === 'recommended');
for (const c of p) line(`     ${c.category.padEnd(5)} ${c.title}  [${c.area}]  best=${c.signals?.bestTime ?? '—'}`);

line('\n══ tolerant of junk ══');
ok('malformed JSON → []', parseDiscovery('not json at all', 'X').length === 0);
ok('empty/no-title entries dropped', parseDiscovery('[{"category":"food"},{"title":""},{"title":"Real Spot","category":"food"}]', 'X').length === 1);
ok('bad category clamped to sight', parseDiscovery('[{"title":"Thing","category":"bogus"}]', 'X')[0].category === 'sight');

line(`\n${pass ? 'ALL PASS' : 'FAILED'}`);
