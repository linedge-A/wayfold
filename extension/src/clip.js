// @license SPDX-License-Identifier: Apache-2.0
//
// clip.js — the in-browser capture step, shared by the popup and the context menu.
//
// It harvests the active tab (schema.org JSON-LD + selection + title) and POSTs an IngestionRequest
// to Wayfold's /api/ingest, which runs the SAME deterministic parsers as the copilot (no parsing
// forks into the extension). The extension is a thin capture + transport client. Returns the
// IngestionResult so the caller can render a confirm card.
//
// Security: capture is user-gesture only (popup open / context-menu click). Page content and
// JSON-LD are treated as untrusted DATA, never instructions. The API base + auth token come from
// extension storage, bound to the signed-in Wayfold account (commit happens server-side).

const DEFAULT_API = 'http://localhost:5173';

// Injected into the page. Self-contained (no closure) — runs in the tab's world.
function harvestPage() {
  const jsonld = [];
  for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(el.textContent);
      if (Array.isArray(parsed)) jsonld.push(...parsed);
      else jsonld.push(parsed);
    } catch (_) { /* malformed — skip */ }
  }
  const selection = String(window.getSelection ? window.getSelection() : '').trim();
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
  return { url: location.href, jsonld, selection, pageTitle: ogTitle || document.title };
}

async function getApiBase() {
  const { wayfoldApi } = await chrome.storage.local.get('wayfoldApi');
  return wayfoldApi || DEFAULT_API;
}
async function getAuthToken() {
  const { wayfoldToken } = await chrome.storage.local.get('wayfoldToken');
  return wayfoldToken || null;
}

/** Harvest the active tab and POST it to /api/ingest. Returns the IngestionResult (or {error}). */
export async function clipActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { error: 'No active tab.' };

  const [{ result: harvested } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: harvestPage,
  });
  if (!harvested) return { error: 'Could not read the page.' };

  const hasJsonld = harvested.jsonld?.length > 0;
  const request = {
    surface: 'extension',
    content: hasJsonld ? 'jsonld' : 'text',
    ...(hasJsonld ? { jsonld: harvested.jsonld } : {}),
    ...(harvested.selection ? { rawText: harvested.selection } : {}),
    url: harvested.url,
    pageTitle: harvested.pageTitle,
  };

  try {
    const apiBase = await getApiBase();
    const token = await getAuthToken();
    const res = await fetch(`${apiBase}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ request }),
    });
    if (!res.ok) return { error: `Server ${res.status}` };
    return await res.json(); // { message, suggestion, bookings, candidates }
  } catch (e) {
    return { error: String(e) };
  }
}
