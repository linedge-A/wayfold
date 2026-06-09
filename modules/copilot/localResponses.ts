/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ItineraryItem } from '@/shared/types/index';

/**
 * Fallback local response handler for Copilot commands if server-side Gemini is not configured.
 */
export function getLocalCopilotResponse(query: string, currentDays: any[], currentItems: ItineraryItem[]): {
  message: string;
  updatedItems?: ItineraryItem[];
  deltas?: any[];
} {
  const norm = query.toLowerCase();

  // Keyword: RECOMMEND
  if (norm === 'recommend' || norm.includes('recommend')) {
    return {
      message: "Based on your interest in architectural walking routes and culinary adventures, I recommend exploring the Pontocho Alley restaurants for dinner on Day 2, or visiting the Silver Pavilion (Ginkaku-ji) if you have an extra hour in the afternoon. Would you like me to add one of these to your research bucket?",
    };
  }

  // Keyword: PROPOSE
  if (norm === 'propose' || norm.includes('propose')) {
    const topPick = { 
      title: 'Kurasu Specialty Coffee', 
      area: 'Marutamachi',
      note: 'A zen-minimalist cafe perfect for your relaxed pacing preference.'
    };
    
    if (currentItems.some(i => i.id === 'place-kurasu-added')) {
      return {
        message: "I've already proposed a specialty coffee stop. Would you like a dinner suggestion instead? I can check for available spots in Gion."
      };
    }

    return {
      message: `I propose adding '${topPick.title}' in ${topPick.area} to your schedule. ${topPick.note} It would fit perfectly into your Day 4 morning track after Fushimi Inari.`,
      updatedItems: [
        ...currentItems,
        {
          id: 'place-kurasu-added',
          dayId: 'day-4',
          title: topPick.title,
          category: 'food',
          area: topPick.area,
          lat: 34.9963, 
          lng: 135.7722,
          startTime: '11:00 AM',
          endTime: '12:00 PM',
          pinState: 'none',
          priority: 'medium',
          estimatedDurationMin: 60,
          note: topPick.note
        }
      ],
      deltas: [
        {
          id: 'delta-propose-' + Date.now(),
          type: 'add',
          itemTitle: topPick.title,
          to: '11:00 AM',
          note: 'Proposed gourmet detour for Day 4 morning based on your pacing settings.'
        }
      ]
    };
  }

  // Keyword: OPTIMIZE
  if (norm === 'optimize' || norm.includes('optimize') || norm.includes('transit')) {
    // Logic for Optimize
    const updated = currentItems.map(item => {
      if (item.id === 'place-kiyomizu') {
        return { ...item, startTime: '09:00 AM', endTime: '10:30 AM' };
      }
      if (item.id === 'place-nishiki-lunch') {
        return { ...item, startTime: '11:30 AM', endTime: '01:00 PM' };
      }
      return item;
    });

    return {
      message: "I have optimized the route for East Kyoto (Day 2)! By moving Kiyomizu-dera to 9:00 AM, we reduce overall walking transit wait times and avoid peak tourist crowds at Nishiki Market.",
      updatedItems: updated,
      deltas: [
        {
          id: 'delta-optimize-' + Date.now(),
          type: 'time-shift',
          itemTitle: 'Kiyomizu-dera',
          from: '10:00 AM',
          to: '09:00 AM',
          note: 'Optimized route sequence to minimize overall transit and walking.'
        }
      ]
    };
  }

  // Handle other legacy keywords
  if (norm.includes('lighter') || norm.includes('lighten') || norm.includes('pacing')) {
    // Make day lighter -> Drop Otagi Nenbutsu-ji from Wednesday (day-3) or lighten Day 3
    const updatedItems = currentItems.filter(item => item.id !== 'place-otagi');
    const droppedItem = currentItems.find(item => item.id === 'place-otagi');
    return {
      message: "I've lightened your Wednesday (Day 3) itinerary by moving 'Otagi Nenbutsu-ji' to the Pocket. This gives you a more relaxed afternoon around Tenryu-ji and the Arashiyama riverbank.",
      updatedItems,
      deltas: [
        {
          id: 'delta-lighten-' + Date.now(),
          type: 'drop',
          itemTitle: droppedItem?.title || 'Otagi Nenbutsu-ji',
          from: '03:00 PM',
          note: 'Removed to create a relaxed, slow-paced afternoon.'
        }
      ]
    };
  }

  // General fallback response
  return {
    message: "I'm ready to help with your Kyoto plans. Try the 'Recommend' button for new spots, 'Propose' to fill your schedule intelligently, or 'Optimize' to improve your route logistics."
  };
}
