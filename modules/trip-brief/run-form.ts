/**
 * Step-3 harness: form payload → brief mapping → one proposal.
 * Run: node_modules/.bin/tsx modules/trip-brief/run-form.ts
 */
import { briefFromForm, generateFromForm, type BriefFormData } from './generateFromBrief';
import { SAMPLE_POOL } from './samplePool';

const cases: { name: string; form: BriefFormData }[] = [
  { name: 'family + dates + food/zen notes', form: { destinations: ['Kyoto'], dateRange: { start: '2026-04-10', end: '2026-04-12' }, groupSize: { adults: 2, children: 2 }, style: 'relaxing', notes: 'Local ramen hunting and zen temples, kid-friendly' } },
  { name: 'friends, no dates (flexible), intense', form: { destinations: ['Kyoto'], groupSize: { adults: 4, children: 0 }, style: 'intense' } },
  { name: 'solo couple default', form: { destinations: ['Kyoto'], dateRange: { start: '2026-04-10', end: '2026-04-11' }, groupSize: { adults: 1, children: 0 } } },
];

for (const c of cases) {
  const { brief, options } = briefFromForm(c.form);
  const r = generateFromForm(c.form, SAMPLE_POOL);
  const stops = r.itineraryDays.reduce((n, d) => n + d.items.length, 0);
  console.log(`\n■ ${c.name}`);
  console.log(`  brief: ${brief.destination} · ${brief.style} · flexible=${brief.flexibleDates}`);
  console.log(`  derived: persona=${options.persona} interests=[${options.interests?.join(', ') || ''}]`);
  console.log(`  → ${r.itineraryDays.length} days, ${stops} stops, ${r.pocket.length} pocket, ${r.flags.length} flags`);
  r.itineraryDays.forEach(d => console.log(`     ${d.label} · ${d.date || 'flexible'} · ${d.areaSummary ?? 'Mixed'} (${d.items.length})`));
}
