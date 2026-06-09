# Seed Data — Wayfold

## Purpose

This file defines the canonical demo trip and sample content used by all branch agents.

Use one shared seed only.
Do not fork alternate versions per module.

---

## Demo trip

### Trip brief
- Title: Kyoto food + temples
- Destination: Kyoto
- Dates: 2026-11-10 to 2026-11-14
- Flexible dates: false
- Style: relaxing
- Transport: transit + walking
- Notes: first trip, wants good food, some classic temples, not overpacked

---

## Day structure

### Day 1 — Gion arrival
- Hotel check-in
- Nishiki Market
- Yasaka Shrine evening walk

### Day 2 — East Kyoto
- Kiyomizu-dera timed visit
- Sannenzaka / Ninenzaka
- Tea break
- Dinner reservation

### Day 3 — Arashiyama light day
- Bamboo Grove
- Tenryu-ji
- Riverside lunch
- Flexible cafe stop

### Day 4 — Central city mix
- Museum backup option
- Shopping street
- Optional gourmet detour

### Day 5 — Departure buffer
- Late breakfast
- Pickup make-up stop if needed
- Transit to station

---

## Hard anchors

- Hotel reservation for all nights
- Kiyomizu-dera timed visit on Day 2 morning
- Omakase dinner reservation on Day 2 evening

These should map to hard constraints or booking-linked items.

---

## Pocket columns

### Must see
- Kiyomizu-dera
- Nishiki Market
- Yasaka Shrine
- Arashiyama Bamboo Grove

### Maybe
- Kyoto International Manga Museum
- Philosopher’s Path
- Kyoto Station rooftop view

### Food
- Omakase dinner
- Katsu curry shop
- Kissaten cafe
- Matcha dessert stop

### Reservations
- Hotel booking
- Omakase dinner booking
- Temple timed ticket

### Backup
- Indoor museum
- Department store food hall
- Additional cafe

---

## Example pocket items

### PlaceItem sample
```ts
{
  id: 'place-kiyomizu',
  title: 'Kiyomizu-dera',
  category: 'sight',
  area: 'Higashiyama',
  estimatedDurationMin: 90,
  sourceType: 'ai',
  tripRole: 'anchor',
  reservationBound: true,
  tags: ['temple', 'classic', 'timed']
}
```

```ts
{
  id: 'place-omakase',
  title: 'Omakase Dinner',
  category: 'food',
  area: 'Gion',
  estimatedDurationMin: 120,
  sourceType: 'email',
  tripRole: 'anchor',
  reservationBound: true,
  tags: ['gourmet', 'reservation']
}
```

---

## Example revision deltas

- Moved Nishiki Market to Day 1 afternoon.
- Shifted tea break to 3:30 PM.
- Added Matcha Dessert Stop to Day 3.
- Marked Kyoto Station rooftop as make-up option for Day 5.

These should be concise and user-facing.

---

## Example commands

- Make day 3 lighter
- Add one gourmet detour
- Reduce transit on day 2
- Recover missed stop tomorrow
- Keep temples but cut walking

---

## Seed data rules

- All modules should reference this same trip.
- Do not rename places casually across modules.
- If seed data changes, update all examples in one pass.
