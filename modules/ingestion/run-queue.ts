/**
 * Harness for the per-account capture inbox.
 * Run: node_modules/.bin/tsx modules/ingestion/run-queue.ts
 */
import { enqueue, listPending, ack, _reset } from './captureQueue';

const line = (s = '') => console.log(s);
let pass = true;
const check = (label: string, cond: boolean) => { line(`  ${cond ? '✓' : '✗'} ${label}`); if (!cond) pass = false; };

_reset();

// 1) enqueue → listed
const a = enqueue('user-A', { candidates: [{ title: 'Nishiki Market' }], source: { surface: 'extension' } });
const b = enqueue('user-A', { bookings: [{ record: { title: 'ANA NH106' } }] });
check('two captures listed for user-A', listPending('user-A').length === 2);
check('capture got an id + timestamp', !!a.id && a.capturedAt > 0);

// 2) account isolation
enqueue('user-B', { candidates: [{ title: 'Pontocho' }] });
check('user-B sees only its own', listPending('user-B').length === 1);
check('user-A unaffected by user-B', listPending('user-A').length === 2);

// 3) ack clears only the applied ids (drain semantics)
const cleared = ack('user-A', [a.id]);
check('ack cleared exactly 1', cleared === 1);
check('user-A now has 1 pending', listPending('user-A').length === 1);
check('the remaining one is the booking', (listPending('user-A')[0] as any).id === b.id);

// 4) ack-all empties the account
ack('user-A', [b.id]);
check('user-A drained to empty', listPending('user-A').length === 0);

line(`\n${pass ? 'ALL PASS' : 'FAILED'}`);
