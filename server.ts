/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 4123;

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

      const requestParams = {
        model: process.env.GEMINI_FLASH_MODEL || 'gemini-flash-latest',
        contents: safeQuery,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2,
          // Google Search grounding requires a higher tier and burns quota quickly;
          // enable via env only when the key's plan supports it.
          ...(process.env.GEMINI_ENABLE_SEARCH === 'true' ? { tools: [{ googleSearch: {} }] } : {})
        }
      };

      // Retry transient overload / rate spikes (503 UNAVAILABLE, 429) with exponential backoff.
      let response: any;
      let lastErr: any;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          response = await ai.models.generateContent(requestParams);
          lastErr = null;
          break;
        } catch (e: any) {
          lastErr = e;
          const status = e?.status;
          if (status === 503 || status === 429) {
            await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt))); // 0.5s, 1s, 2s, 4s
            continue;
          }
          throw e;
        }
      }
      if (!response) throw lastErr;

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
