/**
 * Broad generalization run — 10 NEW destinations/structures, all party types, to avoid overfitting
 * the Bangkok/Porto/Osaka set. Reports aggregate best-time drift + any new structural failures.
 * Run: node_modules/.bin/tsx modules/trip-brief/run-broad.ts
 */
import { generateFromBrief, type TripBrief } from './generateFromBrief';
import { parseClock } from '../constraint-engine/primitives';
const M = (t?: string) => parseClock(t) ?? -1;

type S = { label: string; brief: TripBrief; persona: any; interests?: string[]; pool: any[] };
const br = (o: Partial<TripBrief>): TripBrief => ({ id: 'x', title: 't', destination: o.destination || 't', style: 'balanced', ...o } as TripBrief);

const scenarios: S[] = [
  { label: 'Rome 3d', persona: 'couple', interests: ['history', 'food'], brief: br({ destination: 'Rome', startDate: '2026-05-01', endDate: '2026-05-03' }), pool: [
    { id: 'colosseum', title: 'Colosseum', category: 'sight', area: 'Ancient', lat: 41.8902, lng: 12.4922, openingHours: '8:30 AM - 7 PM', ticketed: true, estimatedDurationMin: 120, priority: 'high', tags: ['history'], signals: { verdict: 'must' } },
    { id: 'forum', title: 'Roman Forum', category: 'sight', area: 'Ancient', lat: 41.8925, lng: 12.4853, openingHours: '8:30 AM - 7 PM', estimatedDurationMin: 90, tags: ['history'] },
    { id: 'vatican', title: 'Vatican Museums', category: 'sight', area: 'Vatican', lat: 41.9029, lng: 12.4534, openingHours: '9 AM - 6 PM', ticketed: true, estimatedDurationMin: 180, tags: ['history', 'architecture'], signals: { verdict: 'must', bestTime: 'morning' } },
    { id: 'trevi', title: 'Trevi Fountain', category: 'sight', area: 'Centro', lat: 41.9009, lng: 12.4833, stopClass: 'corridor', estimatedDurationMin: 20 },
    { id: 'pantheon', title: 'Pantheon', category: 'sight', area: 'Centro', lat: 41.8986, lng: 12.4769, openingHours: '9 AM - 7 PM', estimatedDurationMin: 45, tags: ['history'] },
    { id: 'trastevere', title: 'Trastevere Dinner', category: 'food', area: 'Trastevere', lat: 41.8890, lng: 12.4690, estimatedDurationMin: 90, tags: ['food'], signals: { bestTime: 'night' } },
    { id: 'borghese', title: 'Galleria Borghese', category: 'sight', area: 'Borghese', lat: 41.9142, lng: 12.4923, openingHours: '9 AM - 7 PM', ticketed: true, estimatedDurationMin: 120, tags: ['architecture'] },
  ] },
  { label: 'Iceland Ring 7d', persona: 'family', interests: ['nature'], brief: br({ destination: 'Iceland', startDate: '2027-04-03', endDate: '2027-04-09', style: 'relaxing' }), pool: [
    { id: 'blue-lagoon', title: 'Blue Lagoon', category: 'sight', area: 'Reykjanes', lat: 63.8804, lng: -22.4495, openingHours: '8 AM - 9 PM', reservationBound: true, startTime: '11:00 AM', dayId: 'day-1', estimatedDurationMin: 120 },
    { id: 'thingvellir', title: 'Þingvellir', category: 'sight', area: 'Golden Circle', lat: 64.2559, lng: -21.1295, estimatedDurationMin: 60, tags: ['nature', 'history'] },
    { id: 'geysir', title: 'Geysir', category: 'sight', area: 'Golden Circle', lat: 64.3104, lng: -20.3024, estimatedDurationMin: 45, tags: ['nature'] },
    { id: 'gullfoss', title: 'Gullfoss', category: 'sight', area: 'Golden Circle', lat: 64.3271, lng: -20.1199, estimatedDurationMin: 45, tags: ['nature'], signals: { verdict: 'must' } },
    { id: 'seljalandsfoss', title: 'Seljalandsfoss', category: 'sight', area: 'South', lat: 63.6156, lng: -19.9886, estimatedDurationMin: 40, tags: ['nature'] },
    { id: 'skogafoss', title: 'Skógafoss', category: 'sight', area: 'South', lat: 63.5320, lng: -19.5114, estimatedDurationMin: 40, tags: ['nature'] },
    { id: 'reynisfjara', title: 'Reynisfjara Beach', category: 'sight', area: 'Vík', lat: 63.4064, lng: -19.0448, estimatedDurationMin: 45, tags: ['nature'] },
    { id: 'jokulsarlon', title: 'Jökulsárlón Lagoon', category: 'sight', area: 'Southeast', lat: 64.0784, lng: -16.2306, estimatedDurationMin: 60, tags: ['nature'], signals: { verdict: 'must' } },
    { id: 'aurora', title: 'Aurora Hunt', category: 'sight', area: 'South', lat: 63.7, lng: -18.9, estimatedDurationMin: 90, signals: { verdict: 'must', bestTime: 'aurora' } },
  ] },
  { label: 'Tromsø aurora 2d', persona: 'friends', brief: br({ destination: 'Tromsø', startDate: '2027-01-10', endDate: '2027-01-11' }), pool: [
    { id: 'aurora2', title: 'Aurora Chase', category: 'sight', area: 'Wild', lat: 69.6, lng: 18.9, estimatedDurationMin: 180, signals: { verdict: 'must', bestTime: 'aurora' } },
    { id: 'whale', title: 'Whale Watching', category: 'sight', area: 'Fjord', lat: 69.65, lng: 18.95, openingHours: '9 AM - 2 PM', reservationBound: true, startTime: '09:30 AM', dayId: 'day-1', estimatedDurationMin: 180 },
    { id: 'cable-car', title: 'Fjellheisen Cable Car', category: 'sight', area: 'Tromsø', lat: 69.63, lng: 18.99, estimatedDurationMin: 60, signals: { bestTime: 'sunset' } },
    { id: 'ice-domes', title: 'Tromsø Ice Domes', category: 'sight', area: 'Wild', lat: 69.3, lng: 19.5, estimatedDurationMin: 90 },
  ] },
  { label: 'Marrakech 2d', persona: 'solo', interests: ['food', 'market'], brief: br({ destination: 'Marrakech', startDate: '2026-10-01', endDate: '2026-10-02', style: 'budget' }), pool: [
    { id: 'jemaa', title: 'Jemaa el-Fnaa (night)', category: 'food', area: 'Medina', lat: 31.6258, lng: -7.9892, openingHours: '5 PM - 1 AM', tags: ['food', 'market'], signals: { verdict: 'must', bestTime: 'night' } },
    { id: 'bahia', title: 'Bahia Palace', category: 'sight', area: 'Medina', lat: 31.6218, lng: -7.9836, openingHours: '9 AM - 5 PM', tags: ['history'] },
    { id: 'majorelle', title: 'Jardin Majorelle', category: 'sight', area: 'Gueliz', lat: 31.6417, lng: -8.0033, openingHours: '8 AM - 6 PM', tags: ['garden'] },
    { id: 'souks', title: 'Souks', category: 'sight', area: 'Medina', lat: 31.6295, lng: -7.9892, estimatedDurationMin: 75, tags: ['shopping', 'market'] },
    { id: 'koutoubia', title: 'Koutoubia', category: 'sight', area: 'Medina', lat: 31.6238, lng: -7.9934, stopClass: 'corridor', estimatedDurationMin: 20 },
  ] },
  { label: 'NYC 1d (overload)', persona: 'friends', interests: ['art'], brief: br({ destination: 'New York', startDate: '2026-06-01', endDate: '2026-06-01', style: 'intense' }), pool: [
    { id: 'moma', title: 'MoMA', category: 'sight', area: 'Midtown', lat: 40.7614, lng: -73.9776, openingHours: '10:30 AM - 5:30 PM', ticketed: true, estimatedDurationMin: 120, tags: ['art'], signals: { verdict: 'must' } },
    { id: 'empire', title: 'Empire State (sunset)', category: 'sight', area: 'Midtown', lat: 40.7484, lng: -73.9857, openingHours: '9 AM - 12 AM', estimatedDurationMin: 60, signals: { verdict: 'must', bestTime: 'sunset' } },
    { id: 'central-park', title: 'Central Park', category: 'sight', area: 'Midtown', lat: 40.7829, lng: -73.9654, estimatedDurationMin: 90, tags: ['nature'] },
    { id: 'times-sq', title: 'Times Square', category: 'sight', area: 'Midtown', lat: 40.758, lng: -73.985, stopClass: 'corridor', estimatedDurationMin: 20 },
    { id: 'brooklyn-bridge', title: 'Brooklyn Bridge', category: 'sight', area: 'Downtown', lat: 40.7061, lng: -73.9969, stopClass: 'corridor', estimatedDurationMin: 30 },
    { id: 'liberty', title: 'Statue of Liberty', category: 'sight', area: 'Harbor', lat: 40.6892, lng: -74.0445, openingHours: '9 AM - 4 PM', reservationBound: true, startTime: '10:00 AM', dayId: 'day-1', estimatedDurationMin: 180 },
  ] },
  { label: 'Tokyo 2d', persona: 'family', interests: ['food'], brief: br({ destination: 'Tokyo', startDate: '2026-04-10', endDate: '2026-04-11' }), pool: [
    { id: 'sensoji', title: 'Sensō-ji', category: 'sight', area: 'Asakusa', lat: 35.7148, lng: 139.7967, openingHours: '6 AM - 5 PM', estimatedDurationMin: 60, tags: ['temple'], signals: { bestTime: 'morning' } },
    { id: 'teamlab', title: 'teamLab Planets', category: 'sight', area: 'Toyosu', lat: 35.6197, lng: 139.7858, openingHours: '10 AM - 7 PM', reservationBound: true, startTime: '01:00 PM', dayId: 'day-2', estimatedDurationMin: 120, signals: { verdict: 'must' } },
    { id: 'shibuya', title: 'Shibuya Crossing', category: 'sight', area: 'Shibuya', lat: 35.6595, lng: 139.7004, estimatedDurationMin: 45, signals: { bestTime: 'night' } },
    { id: 'tsukiji', title: 'Tsukiji Outer Market', category: 'food', area: 'Tsukiji', lat: 35.6655, lng: 139.7707, openingHours: '5 AM - 2 PM', estimatedDurationMin: 75, tags: ['food', 'market'], signals: { bestTime: 'morning' } },
    { id: 'ueno', title: 'Ueno Park', category: 'sight', area: 'Ueno', lat: 35.7156, lng: 139.7745, estimatedDurationMin: 60, tags: ['nature'] },
  ] },
  { label: 'Queenstown 3d', persona: 'friends', interests: ['nature'], brief: br({ destination: 'Queenstown', startDate: '2027-02-01', endDate: '2027-02-03', style: 'intense' }), pool: [
    { id: 'milford', title: 'Milford Sound (full day)', category: 'sight', area: 'Fiordland', lat: 44.6, lng: 167.9, reservationBound: true, startTime: '07:00 AM', dayId: 'day-2', estimatedDurationMin: 480, signals: { verdict: 'must' } },
    { id: 'skyline', title: 'Skyline Gondola', category: 'sight', area: 'Queenstown', lat: 45.027, lng: 168.66, estimatedDurationMin: 90, signals: { bestTime: 'sunset' } },
    { id: 'ferg', title: 'Fergburger', category: 'food', area: 'Queenstown', lat: 45.031, lng: 168.661, estimatedDurationMin: 45, tags: ['food'] },
    { id: 'bungee', title: 'Kawarau Bungee', category: 'sight', area: 'Gibbston', lat: 44.99, lng: 168.73, estimatedDurationMin: 90 },
  ] },
  { label: 'Barcelona 2d (2 timed bookings)', persona: 'couple', interests: ['architecture', 'food'], brief: br({ destination: 'Barcelona', startDate: '2026-09-01', endDate: '2026-09-02' }), pool: [
    { id: 'sagrada', title: 'Sagrada Família', category: 'sight', area: 'Eixample', lat: 41.4036, lng: 2.1744, reservationBound: true, startTime: '10:00 AM', endTime: '11:30 AM', dayId: 'day-1', tags: ['architecture'], signals: { verdict: 'must' } },
    { id: 'park-guell', title: 'Park Güell', category: 'sight', area: 'Gràcia', lat: 41.4145, lng: 2.1527, reservationBound: true, startTime: '11:00 AM', endTime: '12:30 PM', dayId: 'day-1', tags: ['architecture'] },
    { id: 'boqueria', title: 'La Boqueria Market', category: 'food', area: 'Ciutat Vella', lat: 41.3817, lng: 2.1717, openingHours: '8 AM - 8:30 PM', estimatedDurationMin: 60, tags: ['food', 'market'], signals: { bestTime: 'morning' } },
    { id: 'gothic', title: 'Gothic Quarter', category: 'sight', area: 'Ciutat Vella', lat: 41.3839, lng: 2.1762, estimatedDurationMin: 75, tags: ['history'] },
    { id: 'tapas', title: 'Tapas Dinner', category: 'food', area: 'Ciutat Vella', lat: 41.3805, lng: 2.1730, estimatedDurationMin: 90, tags: ['food'], signals: { bestTime: 'night' } },
  ] },
  { label: 'Istanbul 2d', persona: 'couple', interests: ['history', 'food'], brief: br({ destination: 'Istanbul', startDate: '2026-10-10', endDate: '2026-10-11' }), pool: [
    { id: 'hagia', title: 'Hagia Sophia', category: 'sight', area: 'Sultanahmet', lat: 41.0086, lng: 28.9802, openingHours: '9 AM - 6 PM', estimatedDurationMin: 75, tags: ['history'], signals: { verdict: 'must' } },
    { id: 'blue-mosque', title: 'Blue Mosque', category: 'sight', area: 'Sultanahmet', lat: 41.0054, lng: 28.9768, estimatedDurationMin: 45, tags: ['history'] },
    { id: 'topkapi', title: 'Topkapı Palace', category: 'sight', area: 'Sultanahmet', lat: 41.0115, lng: 28.9833, openingHours: '9 AM - 6 PM', estimatedDurationMin: 120, tags: ['history'] },
    { id: 'grand-bazaar', title: 'Grand Bazaar', category: 'sight', area: 'Fatih', lat: 41.0108, lng: 28.968, openingHours: '9 AM - 7 PM', estimatedDurationMin: 60, tags: ['shopping', 'market'] },
    { id: 'spice-bazaar', title: 'Spice Bazaar', category: 'food', area: 'Eminönü', lat: 41.0165, lng: 28.9707, openingHours: '8 AM - 7 PM', estimatedDurationMin: 45, tags: ['food', 'market'], signals: { bestTime: 'morning' } },
    { id: 'bosphorus', title: 'Bosphorus Dinner', category: 'food', area: 'Karaköy', lat: 41.0256, lng: 28.9744, estimatedDurationMin: 90, tags: ['food'], signals: { bestTime: 'night' } },
  ] },
  { label: 'Bali 4d (multi-sunset)', persona: 'couple', interests: ['nature'], brief: br({ destination: 'Bali', startDate: '2026-08-01', endDate: '2026-08-04', style: 'luxury' }), pool: [
    { id: 'uluwatu', title: 'Uluwatu Temple (sunset)', category: 'sight', area: 'Bukit', lat: -8.8290, lng: 115.0849, estimatedDurationMin: 90, tags: ['temple'], signals: { verdict: 'must', bestTime: 'sunset' } },
    { id: 'tanah-lot', title: 'Tanah Lot (sunset)', category: 'sight', area: 'Tabanan', lat: -8.6212, lng: 115.0868, estimatedDurationMin: 75, tags: ['temple'], signals: { bestTime: 'sunset' } },
    { id: 'beach-club', title: 'Beach Club (sunset)', category: 'food', area: 'Seminyak', lat: -8.6776, lng: 115.1369, estimatedDurationMin: 120, tags: ['food'], signals: { bestTime: 'sunset' } },
    { id: 'tegallalang', title: 'Tegallalang Rice Terraces', category: 'sight', area: 'Ubud', lat: -8.4318, lng: 115.2793, estimatedDurationMin: 75, tags: ['nature'], signals: { bestTime: 'morning' } },
    { id: 'ubud-market', title: 'Ubud Market', category: 'food', area: 'Ubud', lat: -8.5069, lng: 115.2625, openingHours: '6 AM - 6 PM', estimatedDurationMin: 60, tags: ['food', 'market'], signals: { bestTime: 'morning' } },
    { id: 'monkey-forest', title: 'Monkey Forest', category: 'sight', area: 'Ubud', lat: -8.5188, lng: 115.2585, openingHours: '9 AM - 6 PM', estimatedDurationMin: 60, tags: ['nature'] },
  ] },
];

let totBT = 0, drift = 0, emptyDays = 0, mustOverflow = 0, crashes = 0;
const driftLines: string[] = [];
for (const s of scenarios) {
  try {
    const r = generateFromBrief(s.brief, s.pool, { persona: s.persona, interests: s.interests });
    const sched = r.itineraryDays.flatMap(d => d.items as any[]);
    for (const d of r.itineraryDays) if (d.items.length === 0) emptyDays++;
    for (const p of r.pocket as any[]) if (p.signals?.verdict === 'must' || p.priority === 'high') mustOverflow++;
    for (const it of sched) {
      const bt = String(it.signals?.bestTime || ''); if (!bt) continue;
      totBT++;
      const t = M(it.startTime);
      const off = (/morning|sunrise/.test(bt) && t > 11 * 60) || (/sunset/.test(bt) && t < 17 * 60) || (/aurora|night/.test(bt) && t < 17 * 60);
      if (off) { drift++; driftLines.push(`   ${s.label}: ${it.title} ⟨${bt}⟩ → ${it.startTime}`); }
    }
    console.log(`${s.label.padEnd(30)} ${r.itineraryDays.length}d · sched ${sched.length} · ovf ${r.pocket.length} · flags ${r.flags.length}`);
    r.flags.forEach(f => console.log(`     ${f}`));
  } catch (e: any) { crashes++; console.log(`${s.label}  ✗ CRASH: ${e.message}`); }
}

console.log('\n════════ AGGREGATE (10 destinations) ════════');
console.log(`best-time-sensitive items: ${totBT} · drifted off-window: ${drift} (${Math.round(100 * drift / totBT)}%)`);
console.log(`empty days: ${emptyDays} · must/high items overflowed: ${mustOverflow} · crashes: ${crashes}`);
console.log('\nDRIFT INSTANCES (the bestTime gap, generalized):');
driftLines.forEach(l => console.log(l));

// preference steering re-check in a NEW city (Istanbul), equal-ish base
console.log('\n════════ PREFERENCE RE-CHECK (Istanbul, 1 day) ════════');
const ist = scenarios.find(s => s.label.startsWith('Istanbul'))!.pool;
const oneDay = br({ destination: 'Istanbul', startDate: '2026-10-10', endDate: '2026-10-10' });
for (const [tag, ints] of [['FOODIE', ['food', 'market']], ['CULTURE', ['history']]] as const) {
  const r = generateFromBrief(oneDay, ist, { persona: 'couple', interests: [...ints] });
  const sched = r.itineraryDays.flatMap(d => d.items as any[]);
  const food = sched.filter(i => i.category === 'food' || (i.tags || []).includes('market')).length;
  console.log(`  ${tag} [${ints.join('/')}]: kept ${sched.map(i => i.title).join(', ')}  → food-ish ${food}/${sched.length}`);
}
