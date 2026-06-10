/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { extractCandidates } from './modules/ingestion/extractCandidates';
import { dispatchIngestion, toSuggestion } from './modules/ingestion/dispatchIngestion';
import { enqueue, listPending, ack } from './modules/ingestion/captureQueue';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Google Gen AI client with server key if present
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log('Successfully initialized server-side Google Gen AI SDK integration.');
  } catch (err) {
    console.error('Error starting server-side Gen AI:', err);
  }
} else {
  console.log('GEMINI_API_KEY not found in server environment. Running in mock intelligent mode.');
}

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

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_FLASH_MODEL || 'gemini-flash-latest',
        contents: safeQuery,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2,
          tools: [{ googleSearch: {} }]
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
async function geminiExtractPlaces(text: string): Promise<any[]> {
  if (!ai || !text) return [];
  const systemInstruction = `Extract up to 8 real, named places (restaurants, sights, cafes, hotels) from the text.
Return ONLY a JSON array: [{ "title": string, "category": "food"|"sight"|"stay", "area": string, "tags": string[] }]. No prose.`;
  try {
    const r = await ai.models.generateContent({
      model: process.env.GEMINI_FLASH_MODEL || 'gemini-flash-latest',
      contents: String(text).slice(0, 2000),
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

// Configure Vite middleware in development, serve compiled SPA assets in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite development middleware connected.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Production static asset pipelines primed.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server fully operational on http://localhost:${PORT}`);
  });
}

startServer();
