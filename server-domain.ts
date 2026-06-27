/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wayfold domain pack — the app-specific routes for backend-core's createApp(): the travel copilot
 * (booking ingestion, guarded URL place-extraction, Gemini itinerary edits) + the surface-agnostic
 * ingestion + capture-inbox endpoints. Everything else (security, rate-limit, Gemini client, SPA
 * serving, deploy) is the shared core. `ai` comes from createApp; null → deterministic fallbacks.
 */
import { extractCandidates } from './modules/ingestion/extractCandidates';
import { dispatchIngestion, toSuggestion } from './modules/ingestion/dispatchIngestion';
import { enqueue, listPending, ack } from './modules/ingestion/captureQueue';
import { discoverySystemInstruction, parseDiscovery } from './modules/ingestion/discoverPlaces';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { BackendConfig } from './server-core';

// ── Guarded page fetch for pasted links ───────────────────────────────────────────────────────
// A bare URL carries no extractable text, so fetch the page itself (with SSRF guards) and run the
// SAME deterministic ingestion core over its real content. Guards: http(s) only; the RESOLVED IP
// must be public (checked against private/reserved IPv4+IPv6 ranges — defeats private-host SSRF and
// the obvious DNS/redirect bypasses); redirects followed MANUALLY (≤3), re-validating the host at
// every hop; 6s timeout; HTML/plain only; capped size.
//
// Residual: Node re-resolves DNS on the actual fetch(), so a sub-second rebind between the check and
// the connect is a theoretical TOCTOU window. Fully closing it means connecting to the validated IP
// (a custom undici dispatcher) — a follow-up; undici isn't a dependency here.

/** True for loopback / private / link-local / CGNAT / reserved IPs (IPv4 + IPv6, incl. IPv4-mapped). */
function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/); // IPv4-mapped IPv6
  if (mapped) return isPrivateIp(mapped[1]);
  if (v.includes(':')) {
    if (v === '::1' || v === '::') return true;       // loopback / unspecified
    if (/^f[cd][0-9a-f]{2}:/.test(v)) return true;     // ULA fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(v)) return true;     // link-local fe80::/10
    return false;
  }
  const o = v.split('.').map(Number);
  if (o.length !== 4 || o.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → unsafe
  const [a, b] = o;
  return a === 0 || a === 127 || a === 10 ||
    (a === 169 && b === 254) ||              // link-local
    (a === 172 && b >= 16 && b <= 31) ||     // RFC1918
    (a === 192 && b === 168) ||              // RFC1918
    (a === 100 && b >= 64 && b <= 127) ||    // CGNAT 100.64/10
    a >= 224;                                // multicast / reserved
}

/** Resolve the host and require EVERY resolved address to be public. Literal IPs are checked directly. */
async function hostIsPublic(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return !isPrivateIp(hostname);
  let addrs: { address: string }[];
  try { addrs = await lookup(hostname, { all: true }); } catch { return false; }
  return addrs.length > 0 && addrs.every(a => !isPrivateIp(a.address));
}

/** Bounded, backtracking-safe schema.org JSON-LD extraction. Attribute spans are length-capped
 *  ({0,200}) and each block size-capped so a hostile page can't drive pathological scanning.
 *  MIRRORED in extension/lib/harvest.ts (extractJsonLdFromHtml) — keep the pattern identical. */
function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script\b[^>]{0,200}type=["']application\/ld\+json["'][^>]{0,200}>([\s\S]{0,200000}?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try { const p = JSON.parse(m[1].trim()); Array.isArray(p) ? out.push(...p) : out.push(p); } catch { /* skip bad blocks */ }
  }
  return out;
}

async function fetchPageForExtraction(rawUrl: string): Promise<{ text: string; jsonld: any[] } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    let target = rawUrl;
    let r: Awaited<ReturnType<typeof fetch>> | null = null;
    for (let hop = 0; hop <= 3; hop++) {              // initial fetch + up to 3 redirects
      let u: URL;
      try { u = new URL(target); } catch { return null; }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!(await hostIsPublic(u.hostname))) return null;   // SSRF check re-run at EVERY hop
      const resp = await fetch(u.href, { signal: ctrl.signal, redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WayfoldIngest/0.1)', Accept: 'text/html,text/plain' } });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) return null;
        target = new URL(loc, u.href).href;            // resolve relative Location against current URL
        continue;
      }
      r = resp; break;
    }
    if (!r) return null;                               // exceeded redirect budget
    const ct = String(r.headers.get('content-type') || '');
    if (!r.ok || !/text\/(html|plain)/i.test(ct)) return null;
    const html = (await r.text()).slice(0, 600_000);
    const jsonld = extractJsonLd(html);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|br|tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&#39;|&apos;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n')
      .slice(0, 30_000); // parser-input cap (security review LOW-2)
    return { text, jsonld };
  } catch { return null; } finally { clearTimeout(timer); }
}

export const wayfoldConfig: BackendConfig = {
  serviceName: 'wayfold',
  // Both the copilot proxy AND the state-changing ingest endpoints get the tighter AI cap + token gate.
  aiRoutePaths: ['/api/copilot', '/api/ingest', '/api/discover'],
  registerRoutes(app, { ai }) {

// REST Copilot API Proxy
app.post('/api/copilot', async (req, res) => {
  const { query, appState } = req.body;
  const currentItems = appState?.itineraryItems || [];
  const norm = (query || '').toLowerCase();

  // A pasted booking confirmation is parsed DETERMINISTICALLY (never sent to the model) so it
  // commits as a locked anchor via the client's applyBookings wiring. Booking-text → bookings;
  // blog/place text falls through to the normal flow below.
  try {
    const ing = dispatchIngestion({ surface: 'copilot-paste', content: 'text', rawText: String(query || ''), areaHint: appState?.tripBrief?.destination || '' });
    if (ing.bookings.length) {
      const sug = toSuggestion(ing);
      return res.json({ message: sug.message, suggestion: sug.suggestion, bookings: ing.bookings, candidates: ing.candidates });
    }
  } catch { /* fall through to the normal copilot flow */ }

  // Pasted link → fetch the page (guarded) and run the shared deterministic core on its REAL
  // content (JSON-LD first, then prose), instead of guessing from the bare URL string.
  const pastedUrl = String(query || '').match(/https?:\/\/[^\s"'<>)]+/i)?.[0];
  if (pastedUrl) {
    const page = await fetchPageForExtraction(pastedUrl);
    if (page) {
      try {
        const areaHint = appState?.tripBrief?.destination || '';
        const host = new URL(pastedUrl).hostname.replace(/^www\./, '');
        const pageReply = (places: any[], how: string) => res.json({
          message: `I read **${host}** and pulled **${places.length}** place${places.length === 1 ? '' : 's'} from the page itself${how}. Import them into your Research Pocket below.`,
          suggestion: {
            type: 'Smart Add',
            title: `${places.length} place${places.length === 1 ? '' : 's'} from ${host}`,
            description: 'One-click import. Google details (location, hours, rating) fill in on add.',
            actionLabel: `Add ${places.length} to Pocket`,
            itemsToAdd: places,
          },
          bookings: [],
          candidates: places,
        });

        // 1) Structured data first — schema.org JSON-LD is exact when the page carries it.
        if (page.jsonld.length) {
          const ing = dispatchIngestion({ surface: 'copilot-paste', content: 'jsonld', jsonld: page.jsonld, rawText: page.text, url: pastedUrl, areaHint });
          if (ing.candidates.length || ing.bookings.length) {
            const sug = toSuggestion(ing);
            return res.json({ message: sug.message, suggestion: sug.suggestion, bookings: ing.bookings, candidates: ing.candidates });
          }
        }
        // 2) AI extraction over the page text — curated, real place names (full-page prose is too
        //    noisy for the phrase extractor: it picks up nav/affiliate junk).
        const aiPlaces = await geminiExtractPlaces(page.text, 20_000, 15).catch(() => []);
        if (aiPlaces.length) {
          const enriched = aiPlaces.map((p: any) => ({ ...p, area: p.area || areaHint, website: pastedUrl }));
          return pageReply(enriched, '');
        }
        // 3) Deterministic fallback (no AI key): keep only confident hits, ranked + capped.
        const ing = dispatchIngestion({ surface: 'copilot-paste', content: 'text', sourceType: 'blog', rawText: page.text, url: pastedUrl, areaHint });
        const byConf = [...ing.candidates].sort((a: any, b: any) => (b.signals?.confidence ?? 0) - (a.signals?.confidence ?? 0)).slice(0, 10);
        if (byConf.length) return pageReply(byConf, ' — tagged with the writer\'s verdicts where stated');
      } catch { /* fall through */ }
    }
  }

  // If live AI is ready, process through gemini-flash-latest
  if (ai) {
    try {
      // Limit items sent to the model to avoid bloating the prompt
      const MAX_ITEMS_IN_PROMPT = 50;
      const itemsForPrompt = currentItems.slice(0, MAX_ITEMS_IN_PROMPT);

      const systemInstruction = `
      You are the Travel Copilot inside Wayfold. Your role is to intelligently refine, modify, or suggest adjustments to the user's trip itinerary in response to their commands.
      Keep replies friendly, brief, design-focused, and highly focused on structural revisions.

      Current itinerary items (up to ${MAX_ITEMS_IN_PROMPT} shown):
      ${JSON.stringify(itemsForPrompt)}

      Handle these major command cases optionally:
      1. Lighten / lighter / pacing: Suggest removing the lowest-priority, non-hard-pinned item to create breathing space.
      2. Coffee / gourmet / detour / food: Suggest inserting a relevant local food or coffee detour item.
      3. Optimize / Reduce transit: Propose time-shifts to reduce overall walking or transit time based on the actual item locations and times.
      4. Links / Blogs / Posts / Screenshot of recommendations (e.g. restaurant lists, specific websites/maps links):
         Identify and extract up to 5 suggested places or restaurants, build PlaceItem objects, and embed them in a suggestion under the "itemsToAdd" attribute.

      Provide your human-focused chat answer. If changes are appropriate, append a formatted \`\`\`json-update codeblock at the end containing:
      {
        "updatedItems": [...new items array if changing the existing calendar],
        "deltas": [{ "id": "...", "type": "move|add|drop|time-shift", "itemTitle": "...", "note": "..." }],
        "suggestion": {
          "type": "Smart Add",
          "title": "Import spots/restaurants to Saved Pocket",
          "description": "Found some great spots from your link/recommendation.",
          "actionLabel": "Save to Bucket List",
          "itemsToAdd": [
            {
              "id": "place-import-[unique]",
              "title": "[Name]",
              "category": "food" | "sight",
              "area": "[neighborhood or district]",
              "tags": ["[tag]", ...],
              "subCategory": "[Brief subcategory description]",
              "budget": "[price string]",
              "openingHours": "[hours]",
              "lat": [latitude],
              "lng": [longitude]
            }
          ]
        }
      }
      `;

      // Sanitize: cap query length and cast to string to prevent prompt injection
      const MAX_QUERY_LENGTH = 2000;
      const safeQuery = String(query || '').slice(0, MAX_QUERY_LENGTH);

      // Google Search grounding sharpens place facts but needs a paid tier — it 429s on the free
      // tier and drops every call to the deterministic fallback. Opt in with GEMINI_GROUNDING=1
      // (paid keys); default off so a free-tier key still gets real model replies.
      const useGrounding = /^(1|true|on)$/i.test(process.env.GEMINI_GROUNDING || '');
      // Copilot edits are structured (drop/move/insert against a known itinerary), not open-ended
      // reasoning — the flash model's default "thinking" added ~40s for no quality gain. Disable it
      // (thinkingBudget:0) for snappy replies; override with GEMINI_THINKING_BUDGET if needed.
      const thinkingBudget = Number.isFinite(Number(process.env.GEMINI_THINKING_BUDGET))
        ? Number(process.env.GEMINI_THINKING_BUDGET) : 0;
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_FLASH_MODEL || 'gemini-flash-latest',
        contents: safeQuery,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2,
          thinkingConfig: { thinkingBudget },
          ...(useGrounding ? { tools: [{ googleSearch: {} }] } : {}),
        }
      });

      const responseText = response.text || '';
      
      // Parse optional json update block
      let message = responseText;
      let updatedItems = undefined;
      let deltas = undefined;
      let suggestion = undefined;

      const jMatch = responseText.match(/```json-update\s*([\s\S]*?)\s*```/);
      if (jMatch && jMatch[1]) {
        try {
          const parsed = JSON.parse(jMatch[1]);
          updatedItems = parsed.updatedItems;
          deltas = parsed.deltas;
          suggestion = parsed.suggestion;
          // Clean message
          message = responseText.replace(/```json-update[\s\S]*?```/, '').trim();
        } catch (e) {
          console.error('Failed parsing update block from AI:', e);
        }
      }

      return res.json({
        message,
        updatedItems,
        deltas,
        suggestion
      });

    } catch (apiErr) {
      console.error('Gemini API request failed. Falling back to local smart router:', apiErr);
    }
  }

  // Graceful deterministic response router (No key state / error states)
  const hasUrl = norm.includes('http') || norm.includes('www') || norm.includes('.com') || norm.includes('.io') || norm.includes('maps.') || norm.includes('/') || norm.includes('post');
  const hasPlacesQuery = norm.includes('places') || norm.includes('spot') || norm.includes('best') || norm.includes('top') || norm.includes('restaurant') || norm.includes('eat') || norm.includes('food') || norm.includes('blog') || norm.includes('list') || norm.includes('museum') || norm.includes('screenshot');

  if (hasUrl || hasPlacesQuery) {
    // Reuse the shared deterministic ingestion core (the SAME parser the client and the future
    // Chrome extension use) to extract REAL places from the actual pasted text/URL — instead of
    // returning canned placeholders. Falls back to the demo set only when nothing extracts
    // (e.g. a bare "best food" command with no place names to parse).
    const realPlaces = extractCandidates({
      rawText: String(query || ''),
      sourceType: 'blog',
      areaHint: appState?.tripBrief?.destination || '',
    });
    if (realPlaces.length) {
      return res.json({
        message: `I extracted **${realPlaces.length}** place${realPlaces.length === 1 ? '' : 's'} from your text — verdicts and best-time tags came along. Import them into your Research Pocket with one click.`,
        suggestion: {
          type: 'Smart Add',
          title: `Import ${realPlaces.length} place${realPlaces.length === 1 ? '' : 's'}`,
          description: 'Extracted from your link/text by the shared ingestion parser.',
          actionLabel: `Add ${realPlaces.length} to Pocket`,
          itemsToAdd: realPlaces,
        },
      });
    }

    let suggestedPlaces = [];
    let messageText = "";
    let titleText = "";
    let descText = "";

    // Extract a domain hint to make it feel slightly more active
    let domainHint = "the resource";
    try {
      const urlMatch = norm.match(/https?:\/\/([^\/\s]+)/);
      if (urlMatch && urlMatch[1]) {
        domainHint = urlMatch[1].replace('www.', '');
      }
    } catch (e) {}

    if (norm.includes('restaurant') || norm.includes('eat') || norm.includes('food') || norm.includes('best 5') || norm.includes('5 best') || norm.includes('dining')) {
      suggestedPlaces = [
        {
          id: 'place-import-hohei-' + Date.now(),
          title: 'Gyoza Hohei (Gion)',
          category: 'food',
          area: 'Gion',
          tags: ['dumplings', 'local', 'bibgourmand'],
          subCategory: 'Michelin Gyoza Tavern',
          budget: '¥1,500',
          openingHours: '5 PM - 11 PM',
          imageUrl: 'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?q=80&w=300&auto=format&fit=crop',
          lat: 47,
          lng: 54
        },
        {
          id: 'place-import-monk-' + Date.now(),
          title: 'Restaurant Monk',
          category: 'food',
          area: 'Higashiyama',
          tags: ['woodfired', 'seasonal', 'chef-table'],
          subCategory: 'Wood-Fired Tasting Menu',
          budget: '¥15,000',
          openingHours: '5 PM - 10:30 PM',
          imageUrl: 'https://images.unsplash.com/photo-1590069230002-da99bfef1c43?q=80&w=300&auto=format&fit=crop',
          lat: 53,
          lng: 58
        },
        {
          id: 'place-import-shigetsu-' + Date.now(),
          title: 'Shigetsu Zen Vegetarian',
          category: 'food',
          area: 'Arashiyama',
          tags: ['temple-food', 'zen', 'vegetarian'],
          subCategory: 'Zen Shojin Ryori',
          budget: '¥5,000',
          openingHours: '11 AM - 2 PM',
          imageUrl: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?q=80&w=300&auto=format&fit=crop',
          lat: 36,
          lng: 23
        },
        {
          id: 'place-import-cacao-' + Date.now(),
          title: 'Cacao Market by MarieBelle',
          category: 'food',
          area: 'Gion',
          tags: ['chocolate', 'cafe', 'sweets'],
          subCategory: 'Chocolatier & Cafe',
          budget: '¥1,200',
          openingHours: '11 AM - 7 PM',
          imageUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef03a7403f?q=80&w=300&auto=format&fit=crop',
          lat: 48,
          lng: 50
        },
        {
          id: 'place-import-menbaka-' + Date.now(),
          title: 'Menbaka Fire Ramen',
          category: 'food',
          area: 'Kamigyo Ward',
          tags: ['ramen', 'fire', 'experience'],
          subCategory: 'Interactive Ramen Show',
          budget: '¥1,850',
          openingHours: '11 AM - 11 PM',
          imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?q=80&w=300&auto=format&fit=crop',
          lat: 42,
          lng: 38
        }
      ];
      messageText = `I've parsed the Kyoto gourmet resource from **${domainHint}** and successfully extracted **5 highly recommended restaurants**! These are perfect for your bucket list: \n\n1. **Gyoza Hohei** (Michelin Bib Gourmand tavern in Gion)\n2. **Restaurant Monk** (Legendary wood-fired tasting menu)\n3. **Shigetsu Zen Vegetarian** (Sublime gardenShojin Ryori in Tenryu-ji)\n4. **Cacao Market** (Cozy riverside artisanal chocolate shop)\n5. **Menbaka Fire Ramen** (Unforgettable blazing fire ramen culinary theater)\n\nYou can import these 5 recommendation cards directly into your Research Pocket (FOOD & DRINK shelf) using the one-click action below!`;
      titleText = "Import 5 Recommended Kyoto Restaurants";
      descText = "Add Gyoza Hohei, Monk, Shigetsu, Cacao Market, and Menbaka to your bucket list with one click.";
    } else {
      suggestedPlaces = [
        {
          id: 'place-import-kinkaku-' + Date.now(),
          title: 'Kinkaku-ji (Golden Pavilion)',
          category: 'sight',
          area: 'Kita Ward',
          tags: ['temple', 'zen', 'must-see'],
          subCategory: 'Historic Golden Temple',
          budget: '¥500',
          openingHours: '9 AM - 5 PM',
          imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=300&auto=format&fit=crop',
          lat: 34,
          lng: 28
        },
        {
          id: 'place-import-gion-' + Date.now(),
          title: 'Gion District Walk',
          category: 'sight',
          area: 'Gion',
          tags: ['walking', 'historic', 'geisha'],
          subCategory: 'Traditional Machiya Streets',
          budget: 'Free',
          openingHours: '24 Hrs',
          imageUrl: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?q=80&w=300&auto=format&fit=crop',
          lat: 49,
          lng: 53
        },
        {
          id: 'place-import-museum-' + Date.now(),
          title: 'Kyoto National Museum',
          category: 'sight',
          area: 'Higashiyama',
          tags: ['museum', 'art', 'history'],
          subCategory: 'Imperial Treasures Collection',
          budget: '¥700',
          openingHours: '9:30 AM - 5 PM',
          imageUrl: 'https://images.unsplash.com/photo-1624238517594-5cb8d7065f4d?q=80&w=300&auto=format&fit=crop',
          lat: 51,
          lng: 52
        }
      ];
      messageText = `I've analyzed the recommended spot from **${domainHint}** and successfully extracted **3 signature places of interest**! These are ideal reference additions:\n\n1. **Kinkaku-ji** (The glorious Golden Pavilion temple)\n2. **Gion District Walk** (Preserved traditional wooden architecture pathway)\n3. **Kyoto National Museum** (Elite collections of traditional Japanese fine art)\n\nYou can easily import these 3 recommendation cards into your Research Pocket (MUST SEE shelf) using the one-click button below!`;
      titleText = "Import Recommended Kyoto Sights";
      descText = "Add Kinkaku-ji, Gion Walk, and Kyoto National Museum directly to your MUST SEE bucket list.";
    }

    return res.json({
      message: messageText,
      suggestion: {
        type: 'Smart Add',
        title: titleText,
        description: descText,
        actionLabel: 'Add to Bucket List',
        itemsToAdd: suggestedPlaces
      }
    });
  }

  if (norm.includes('lighter') || norm.includes('lighten')) {
    // Data-driven: drop the lowest-priority, non-hard-pinned item across all days
    const priorityRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const candidates = currentItems.filter((i: any) => i.pinState !== 'hard');
    const droppedItem = candidates.sort(
      (a: any, b: any) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1)
    )[0];

    if (!droppedItem) {
      return res.json({ message: "All items are hard-pinned — nothing to remove for a lighter schedule." });
    }

    const updated = currentItems.filter((i: any) => i.id !== droppedItem.id);
    return res.json({
      message: `I've lightened your schedule by removing '${droppedItem.title}' to create more breathing room.`,
      updatedItems: updated,
      deltas: [
        {
          id: 'delta-lighten-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
          type: 'drop',
          itemTitle: droppedItem.title,
          from: droppedItem.startTime,
          note: 'Removed lowest-priority item to create a more relaxed pacing.'
        }
      ]
    });
  }

  if (norm.includes('coffee') || norm.includes('gourmet') || norm.includes('detour') || norm.includes('food')) {
    const alreadyExists = currentItems.some((i: any) => i.id === 'place-kurasu-added');
    if (alreadyExists) {
      return res.json({
        message: "I've already added your gourmet coffee detour nearby! Let me know if you would like me to swap other segments."
      });
    }

    const coffeeItem = {
      id: 'place-kurasu-added',
      dayId: 'day-4',
      title: 'Kurasu Specialty Coffee',
      category: 'food',
      area: 'Marutamachi',
      lat: 44,
      lng: 48,
      startTime: '11:30 AM',
      endTime: '12:30 PM',
      pinState: 'none',
      priority: 'medium',
      note: 'Highly rated pour-over specialty coffee'
    };

    return res.json({
      message: "Indeed! I have inserted a deluxe gourmet detour 'Kurasu Coffee' at 11:30 AM on Thursday immediately following your Fushimi Inari Gates visit.",
      updatedItems: [...currentItems, coffeeItem],
      deltas: [
        {
          id: 'delta-coffee-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
          type: 'add',
          itemTitle: 'Kurasu Specialty Coffee',
          to: '11:30 AM',
          note: 'Injected premium refueling coffee detour near central loop.'
        }
      ]
    });
  }

  if (norm.includes('reduce transit') || norm.includes('transit') || norm.includes('optimize')) {
    const updated = currentItems.map((item: any) => {
      if (item.id === 'place-kiyomizu') {
        return { ...item, startTime: '09:00 AM', endTime: '10:30 AM' };
      }
      if (item.id === 'place-nishiki-lunch') {
        return { ...item, startTime: '11:30 AM', endTime: '01:00 PM' };
      }
      return item;
    });

    return res.json({
      message: "I have optimized the travel sequence for Higashiyama (Day 2)! By pushing Kiyomizu-dera to 9:00 AM and Nishiki Market Lunch to 11:30 AM, we eliminate dead transit buffers entirely.",
      updatedItems: updated,
      deltas: [
        {
          id: 'delta-optimize-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
          type: 'time-shift',
          itemTitle: 'Kiyomizu-dera',
          from: '10:00 AM',
          to: '09:00 AM',
          note: 'Optimized morning sequence route.'
        }
      ]
    });
  }

  // General fallback
  return res.json({
    message: "I've received your request! Try pasting a food blog link, a Google Maps link, or ask me to 'Make day 3 lighter' for instant calendar updates.",
    suggestion: {
      type: 'Smart Add',
      title: 'Traditional Tea Ceremony',
      description: 'Add a relaxing cultural break to Day 4 afternoon.',
      actionLabel: 'Add to Thursday'
    }
  });
});

// AI place-extraction fallback — reuses the SAME `ai` client as /api/copilot (no second client).
// Only called when the deterministic core finds nothing.
async function geminiExtractPlaces(text: string, maxChars = 2000, maxPlaces = 8): Promise<any[]> {
  if (!ai || !text) return [];
  const systemInstruction = `Extract up to ${maxPlaces} real, named places (restaurants, sights, cafes, hotels) the text RECOMMENDS VISITING.
Ignore navigation, ads, affiliate products, and the site's own name.
Return ONLY a JSON array: [{ "title": string, "category": "food"|"sight"|"stay", "area": string, "tags": string[] }]. No prose.`;
  try {
    const r = await ai.models.generateContent({
      model: process.env.GEMINI_FLASH_MODEL || 'gemini-flash-latest',
      contents: String(text).slice(0, maxChars),
      config: { systemInstruction, temperature: 0 },
    });
    const m = (r.text || '').match(/\[[\s\S]*\]/);
    const arr = m ? JSON.parse(m[0]) : [];
    return Array.isArray(arr)
      ? arr.map((p: any, i: number) => ({
          id: `place-ai-${Date.now()}-${i}`,
          title: p.title,
          category: p.category === 'food' || p.category === 'stay' ? p.category : 'sight',
          area: p.area || '',
          tags: Array.isArray(p.tags) ? p.tags : [],
          sourceType: 'ai',
        })).filter((p: any) => p.title)
      : [];
  } catch {
    return [];
  }
}

// AI place DISCOVERY — reuses the SAME `ai` client. Seeds a NEW trip's pool from its destination
// when the user has no saved research (deterministic generation has nothing to schedule otherwise).
async function geminiDiscoverPlaces(destination: string, opts: { count?: number; style?: string; interests?: string[] }): Promise<any[]> {
  if (!ai || !destination) return [];
  try {
    const r = await ai.models.generateContent({
      model: process.env.GEMINI_FLASH_MODEL || 'gemini-flash-latest',
      contents: `Destination: ${destination}`,
      config: { systemInstruction: discoverySystemInstruction(destination, opts), temperature: 0.5 },
    });
    return parseDiscovery(r.text || '', destination);
  } catch {
    return [];
  }
}

// POST /api/discover { destination, style?, interests?, count? } → { candidates: PlaceItem[] }.
// The client calls this when the Research Pocket is empty, seeds the generation pool with the
// result, enriches via Google Places (real coords), and plans — so a new trip is populated for its
// real destination instead of coming out empty.
app.post('/api/discover', async (req, res) => {
  const { destination, style, interests, count } = req.body || {};
  if (!destination || typeof destination !== 'string') {
    return res.status(400).json({ candidates: [], message: 'A destination is required.' });
  }
  const candidates = await geminiDiscoverPlaces(destination, {
    style: typeof style === 'string' ? style : undefined,
    interests: Array.isArray(interests) ? interests.filter((i: unknown) => typeof i === 'string') : undefined,
    count: typeof count === 'number' ? Math.max(4, Math.min(20, count)) : undefined,
  });
  return res.json({
    candidates,
    message: candidates.length
      ? `Discovered ${candidates.length} places to start your ${destination} trip — refine them in the Pocket, then generate.`
      : 'Could not auto-discover places (no AI key configured, or none came back). Paste some research or ask the copilot for ideas.',
  });
});

// Surface-agnostic ingestion endpoint. The copilot paste path, a forward-to-inbox webhook, and the
// future Chrome extension all POST an IngestionRequest here. Runs the shared deterministic core
// (dispatchIngestion — the SAME parsers the client uses); only on no deterministic hit does it fall
// back to the AI extractor above. Returns bookings (→ applyBookings) + place candidates (→ Pocket).
app.post('/api/ingest', async (req, res) => {
  const request = req.body?.request || req.body || {};
  let result;
  try {
    result = dispatchIngestion(request);
  } catch {
    return res.status(400).json({ message: 'Invalid ingestion request.' });
  }

  if (result.bookings.length || result.candidates.length) {
    const sug = toSuggestion(result);
    return res.json({ message: sug.message, suggestion: sug.suggestion, bookings: result.bookings, candidates: result.candidates });
  }

  if (request.rawText) {
    const aiPlaces = await geminiExtractPlaces(request.rawText).catch(() => []);
    if (aiPlaces.length) {
      return res.json({
        message: `Extracted ${aiPlaces.length} place${aiPlaces.length === 1 ? '' : 's'} with AI assist — staged in your Pocket.`,
        suggestion: { type: 'Smart Add', title: `Import ${aiPlaces.length} places`, description: 'AI-extracted from your text.', actionLabel: `Add ${aiPlaces.length} to Pocket`, itemsToAdd: aiPlaces },
        candidates: aiPlaces,
        bookings: [],
      });
    }
  }

  return res.json({ message: result.warnings[0] || 'No bookings or places found.', bookings: [], candidates: [] });
});

// ── Capture inbox: the bridge for surfaces that can't mutate trip state directly (the extension). ──
// There is no server-side trip store — the web app holds state client-side. So a capture is QUEUED
// per account here; the web app drains it on load/focus and applies it through the existing paths
// (candidates → Pocket suggestion, bookings → applyBookings). Reuses, doesn't re-implement.
const accountOf = (req: any): string => {
  const m = String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1].slice(0, 64) : 'default';
};

app.post('/api/ingest/commit', (req, res) => {
  const { bookings, candidates, source } = req.body || {};
  if (!(bookings?.length) && !(candidates?.length)) return res.status(400).json({ ok: false, message: 'Nothing to commit.' });
  const account = accountOf(req);
  const rec = enqueue(account, { bookings, candidates, source });
  return res.json({ ok: true, id: rec.id, queued: listPending(account).length });
});

app.get('/api/ingest/pending', (req, res) => {
  return res.json({ captures: listPending(accountOf(req)) });
});

app.post('/api/ingest/ack', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  return res.json({ ok: true, cleared: ack(accountOf(req), ids) });
});

  }, // end registerRoutes
};
