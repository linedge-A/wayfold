/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Display taxonomy — 5 intent-based categories (See / Eat / Do / Stay / Transit),
 * consolidated per OTA practice (TripAdvisor Hotels·Restaurants·Things-to-Do;
 * Booking/Expedia Stays·Attractions·Things-to-do; GetYourGuide experiences) and
 * stress-tested on a 65-POI corpus across city / Japan / nature / beach trips.
 *
 * Key rule: category = WHAT YOU DO THERE. "Booked" and "Backup" are STATUS,
 * not place types — they ride on existing fields (reservationBound, tripRole)
 * and surface as tags/badges orthogonal to the category.
 *
 * This is a DISPLAY-LAYER mapping over the legacy `PlaceItem.category` union —
 * the shared contract is untouched (migrating it is an Agent 9 change, tracked
 * separately). Legacy 'backup'/'booking' categories are re-classified by intent
 * via keyword rules on title/subCategory.
 */
import { PlaceItem } from '@/shared/types/index';

export type DisplayCat = 'see' | 'eat' | 'do' | 'stay' | 'transit';
export type StatusTag = 'booked' | 'backup' | 'must';

export const DISPLAY_CATS: DisplayCat[] = ['see', 'eat', 'do', 'stay', 'transit'];

export const DISPLAY_CAT_LABEL: Record<DisplayCat, string> = {
  see: 'See',
  eat: 'Eat & Drink',
  do: 'Do',
  stay: 'Stay',
  transit: 'Transit',
};

/** Canonical sub-categories per category (≤5 each, versatile — for pickers/fakes). */
export const DISPLAY_SUBS: Record<DisplayCat, string[]> = {
  see: ['Landmark', 'Museum & Art', 'Nature', 'Viewpoint', 'Religious & Historic'],
  eat: ['Restaurant', 'Café & Bakery', 'Bar & Drinks', 'Food Market'],
  do: ['Tour', 'Outdoor & Adventure', 'Class & Wellness', 'Entertainment', 'Shopping'],
  stay: ['Hotel & Resort', 'Hostel & Budget', 'Rental', 'Unique & B&B', 'Camping'],
  transit: ['Air', 'Rail & Transit', 'Rental Vehicle', 'Water'],
};

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');

// Priority-ordered intent rules (first match wins) — used only when the legacy
// category doesn't already decide (i.e. for 'backup'/'booking' re-classification).
const RULES: { re: RegExp; cat: DisplayCat }[] = [
  { re: /\b(ski|snowboard|slope)\b/, cat: 'do' },
  { re: /\b(hotel|hostel|ryokan|guesthouse|guest house|inn|resort|apartment|airbnb|motel|capsule|b&b|bnb|lodge|cabin|campground|camping|campsite|villa)\b/, cat: 'stay' },
  { re: /\b(airport|train station|station|terminal|ferry|car rental|bike rental|rental|bus stop|metro|subway|tram|cruise port|gondola|cable car|funicular|parking|transfer)\b/, cat: 'transit' },
  { re: /\b(spa|onsen|hot spring|bathhouse|cooking class|class|workshop|tasting|tour|cruise|hike|hiking|trail|trek|kayak|surf|dive|snorkel|zipline|safari|outdoor|adventure|wellness|entertainment|theme park|amusement park|water park|zoo|aquarium|casino|escape room|karaoke|nightclub|club|show|cabaret|theatre|theater|cinema|concert|stadium|mall|shopping|outlet|boutique|department store|digital art|immersive|tea ceremony|experience|self-drive|self drive|ticket|reservation)\b/, cat: 'do' },
  { re: /\b(restaurant|bistro|izakaya|ramen|sushi|noodle|diner|eatery|cafe|coffee|teahouse|tea house|bakery|patisserie|boulangerie|bar|pub|food market|night market|street food|food hall|brunch|brewery|kaiseki|tavern)\b/, cat: 'eat' },
  { re: /\b(temple|shrine|church|basilica|cathedral|mosque|monastery|pagoda|coeur|castle|palace|museum|gallery|monument|memorial|landmark|viewpoint|lookout|observation deck|tower|garden|botanical|park|waterfall|falls|geyser|lake|beach|bridge|gate|torii|ruins|statue|square|plaza|old town|district|quarter|alley|grove|forest|street art|library|cemetery|canyon|volcano|glacier|cliff)\b/, cat: 'see' },
];

/** Map a legacy PlaceItem onto its display category (intent-based, exactly one). */
export function displayCategory(item: Pick<PlaceItem, 'category' | 'title' | 'subCategory' | 'tags'>): DisplayCat {
  const hay = () => norm(`${item.subCategory || ''} ${item.title || ''} ${(item.tags || []).join(' ')}`);
  switch (item.category) {
    case 'sight': {
      // Legacy 'sight' lumps See + Do — re-file activity-intent items (tours, classes,
      // shows, shopping, wellness…) into Do; everything else stays See.
      const hit = RULES.find(r => r.re.test(hay()));
      return hit?.cat === 'do' ? 'do' : 'see';
    }
    case 'food': return 'eat';
    case 'stay': return 'stay';
    case 'transit': return 'transit';
    default: {
      // 'backup' / 'booking' are statuses wearing a category — recover the real intent.
      const hit = RULES.find(r => r.re.test(hay()));
      // Bookings without a recognizable venue noun are most often reserved experiences.
      return hit?.cat ?? (item.category === 'booking' ? 'do' : 'see');
    }
  }
}

/** Status tags — orthogonal to category. Derived from existing fields. */
export function statusTags(item: Pick<PlaceItem, 'category' | 'reservationBound' | 'tripRole'> & { priority?: string }): StatusTag[] {
  const tags: StatusTag[] = [];
  if (item.reservationBound || item.category === 'booking') tags.push('booked');
  if (item.tripRole === 'optional' || item.category === 'backup') tags.push('backup');
  if (item.priority === 'must') tags.push('must');
  return tags;
}

export const STATUS_LABEL: Record<StatusTag, string> = { booked: 'Booked', backup: 'Backup', must: 'Must-see' };
