/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wayfold client-side Firebase init. Config comes from Vite env vars (VITE_FIREBASE_*) — fill in
 * .env from the Firebase console (Project settings → Web app). Anonymous-first auth: we sign in
 * anonymously on the first save; see docs/collab-model.md.
 *
 * Placeholder-safe: if config is absent, exports are null and callers fall back to local mode
 * (localStorage only) — so the single-device app runs unchanged until a Firebase project is wired.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// Cast to any to read Vite build-time env without pulling in vite/client types (repo convention —
// see app-shell/mapsKey.ts, shared/usage/sessionMeter.ts).
const env = (import.meta as any).env || {};
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** True once a real web-app config is present. Everything cloud is gated on this — until then the
 *  app stays in local mode and these exports are null (callers degrade gracefully). */
export const firebaseEnabled = Boolean(cfg.apiKey && cfg.projectId);

export const app: FirebaseApp | null = firebaseEnabled ? initializeApp(cfg) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;
export const auth: Auth | null = app ? getAuth(app) : null;
export const storage: FirebaseStorage | null = app ? getStorage(app) : null;

if (!firebaseEnabled && typeof window !== 'undefined') {
  console.info('[Wayfold] Firebase config not set — running in local mode (no cloud co-planning).');
}
