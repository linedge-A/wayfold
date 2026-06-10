/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Google Maps API key resolution — read from any of the supported env sources, and a validity
 * check that rejects empty / placeholder keys. Kept out of App.tsx so the shell stays composition-only.
 */
export const API_KEY = (
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  ''
).trim();

// A real-looking key, not a placeholder or empty.
export const IS_VALID_KEY = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY' && API_KEY.length > 10;
