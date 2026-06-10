// @license SPDX-License-Identifier: Apache-2.0
//
// popup.js — on open, clips the active tab via the shared core (/api/ingest) and renders a confirm
// card (draft-to-Pocket per AGENTS.md). "Add to my trip" commits to the signed-in account.
import { clipActiveTab } from './clip.js';

const $status = document.getElementById('status');
const $results = document.getElementById('results');
const $save = document.getElementById('save');

let lastResult = null;

function render(r) {
  $results.innerHTML = '';
  const items = [];
  for (const b of r.bookings || []) {
    items.push(`<li class="booking">📌 <b>${esc(b.record.title)}</b> <span class="tag">${esc(b.record.from || '')}${b.record.to ? '→' + esc(b.record.to) : ''} ${esc(b.record.startISO || '')}</span></li>`);
  }
  for (const c of (r.suggestion?.itemsToAdd || r.candidates || [])) {
    items.push(`<li>📍 ${esc(c.title)} <span class="tag">${esc(c.category)}${c.area ? ' · ' + esc(c.area) : ''}</span></li>`);
  }
  $results.innerHTML = items.join('') || '<li class="tag">Nothing to import on this page.</li>';
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(async () => {
  const r = await clipActiveTab();
  lastResult = r;
  if (r.error) { $status.textContent = `Couldn't read this page (${r.error}).`; return; }
  $status.textContent = r.message || 'Found these:';
  render(r);
  const count = (r.bookings?.length || 0) + (r.suggestion?.itemsToAdd?.length || r.candidates?.length || 0);
  $save.disabled = count === 0;
})();

$save.addEventListener('click', async () => {
  if (!lastResult) return;
  $save.disabled = true;
  $save.textContent = 'Saving…';
  // Commit path (server-side, bound to the signed-in account) — endpoint /api/ingest/commit is the
  // P2 follow-up; bookings flow through applyBookings, candidates through the Pocket suggestion.
  const { wayfoldApi } = await chrome.storage.local.get('wayfoldApi');
  try {
    await fetch(`${wayfoldApi || 'http://localhost:5173'}/api/ingest/commit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookings: lastResult.bookings, candidates: lastResult.suggestion?.itemsToAdd || lastResult.candidates }),
    });
    $save.textContent = 'Saved ✓';
  } catch {
    $save.textContent = 'Save failed — open Wayfold';
  }
});
