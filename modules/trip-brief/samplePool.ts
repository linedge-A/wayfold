/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A small built-in candidate pool so the trip-brief form can generate a real proposal out of the
 * box (matches the seeded Kyoto MVP). In the wired app, App injects the real pool (seed/pocket
 * candidates) and this is only the fallback.
 */
import type { EngineItem } from '../constraint-engine/planner.ts';

export const SAMPLE_POOL: EngineItem[] = [
  { id: 'kiyomizu', title: 'Kiyomizu-dera', category: 'sight', area: 'Higashiyama', lat: 34.9949, lng: 135.7850, priority: 'high', estimatedDurationMin: 90, signals: { bestTime: 'early morning', verdict: 'must' } },
  { id: 'ninenzaka', title: 'Ninenzaka Stroll', category: 'sight', area: 'Higashiyama', lat: 34.9966, lng: 135.7820, estimatedDurationMin: 45 },
  { id: 'gion', title: 'Gion Lantern Walk', category: 'sight', area: 'Gion', lat: 35.0036, lng: 135.7745, estimatedDurationMin: 45, signals: { bestTime: 'evening' } },
  { id: 'nishiki', title: 'Nishiki Market', category: 'food', area: 'Central', lat: 35.0050, lng: 135.7649, estimatedDurationMin: 60, openingHours: '9 AM - 6 PM', tags: ['food', 'market'] },
  { id: 'pontocho', title: 'Pontocho Dinner', category: 'food', area: 'Central', lat: 35.0042, lng: 135.7706, estimatedDurationMin: 75, openingHours: '5 PM - 11 PM', signals: { bestTime: 'night' }, tags: ['food', 'tavern'] },
  { id: 'kinkakuji', title: 'Kinkaku-ji', category: 'sight', area: 'Northwest', lat: 35.0394, lng: 135.7292, priority: 'high', estimatedDurationMin: 60, signals: { verdict: 'must' }, tags: ['zen', 'garden'] },
  { id: 'ryoanji', title: 'Ryoan-ji', category: 'sight', area: 'Northwest', lat: 35.0345, lng: 135.7183, estimatedDurationMin: 45, tags: ['zen', 'garden'] },
  { id: 'arashiyama', title: 'Bamboo Grove', category: 'sight', area: 'Arashiyama', lat: 35.0170, lng: 135.6716, priority: 'high', estimatedDurationMin: 45, signals: { bestTime: 'sunrise', verdict: 'must' } },
  { id: 'tenryuji', title: 'Tenryu-ji', category: 'sight', area: 'Arashiyama', lat: 35.0157, lng: 135.6738, estimatedDurationMin: 50, tags: ['zen', 'garden'] },
  { id: 'fushimi', title: 'Fushimi Inari', category: 'sight', area: 'South', lat: 34.9671, lng: 135.7727, priority: 'high', estimatedDurationMin: 90, signals: { verdict: 'must' }, tags: ['shrine', 'walking'] },
];
