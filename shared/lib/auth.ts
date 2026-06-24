/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Anonymous-first auth (docs/collab-model.md). Planning needs no login; we sign in anonymously
 * lazily — on the first action that writes to Firestore (joining/creating a co-planning workspace).
 * A single in-flight promise is shared so concurrent first-writes don't race two sign-ins.
 * Placeholder-safe: if Firebase isn't configured, ensureSignedIn() resolves to null and callers
 * fall back to local mode.
 */
import {
  signInAnonymously, signOut, onAuthStateChanged, GoogleAuthProvider, linkWithPopup, signInWithPopup,
  type User,
} from 'firebase/auth';
import { auth, firebaseEnabled } from './firebase';

let pending: Promise<string | null> | null = null;

/**
 * Resolve the current uid, signing in anonymously if needed. Returns null in local mode
 * (Firebase not configured) so callers can degrade gracefully instead of throwing.
 */
export function ensureSignedIn(): Promise<string | null> {
  if (!firebaseEnabled || !auth) return Promise.resolve(null);
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  if (pending) return pending;
  pending = signInAnonymously(auth)
    .then((cred) => cred.user.uid)
    .catch((err) => {
      console.warn('[Wayfold] anonymous sign-in failed — staying in local mode:', err?.code || err);
      return null;
    })
    .finally(() => { pending = null; });
  return pending;
}

/** Current uid if already signed in, else null. Does NOT trigger a sign-in. */
export function currentUid(): string | null {
  return auth?.currentUser?.uid ?? null;
}

/** A Firebase ID token for the current user (signing in anonymously if needed) — for server calls
 *  that verify the caller via Admin verifyIdToken. Null in local mode / on failure (caller degrades). */
export async function getIdToken(): Promise<string | null> {
  if (!firebaseEnabled || !auth) return null;
  await ensureSignedIn();
  if (!auth.currentUser) return null;
  try { return await auth.currentUser.getIdToken(); } catch { return null; }
}

/** Subscribe to auth state (for surfacing signed-in/linked status in the UI). */
export function onUid(cb: (uid: string | null) => void): () => void {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, (u: User | null) => cb(u?.uid ?? null));
}

/** True if the current user is anonymous (or absent). A linked (Google) account returns false. */
export function isAnonymous(): boolean {
  return auth?.currentUser?.isAnonymous ?? true;
}

/** Sign out (returns to anonymous/local on next ensureSignedIn). No-op in local mode. */
export async function signOutUser(): Promise<void> {
  if (auth) { try { await signOut(auth); } catch { /* ignore */ } }
}

/**
 * Upgrade the current anonymous user to a permanent Google account WITHOUT losing their uid (and
 * therefore their workspace membership). Required before taking payment — a subscription must attach
 * to a durable identity, not an anonymous uid that can vanish on a cache clear.
 *
 * If the Google account already exists as a separate Firebase user (signed up earlier on another
 * device), linkWithPopup fails with credential-already-in-use; we fall back to signing into that
 * existing account. (Merging the anonymous workspace into it is a later task — see Phase 5.)
 */
export async function linkWithGoogle(): Promise<{ ok: boolean; uid?: string; note?: string; error?: string }> {
  if (!firebaseEnabled || !auth) return { ok: false, error: 'firebase-disabled' };
  await ensureSignedIn();
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'no-user' };
  const provider = new GoogleAuthProvider();
  try {
    const cred = await linkWithPopup(user, provider); // same uid, now permanent
    return { ok: true, uid: cred.user.uid };
  } catch (err: any) {
    if (err?.code === 'auth/credential-already-in-use' || err?.code === 'auth/email-already-in-use') {
      try {
        const res = await signInWithPopup(auth, provider); // switch to the pre-existing account
        return { ok: true, uid: res.user.uid, note: 'switched-to-existing' };
      } catch (e: any) {
        return { ok: false, error: e?.code || 'link-failed' };
      }
    }
    return { ok: false, error: err?.code || 'link-failed' };
  }
}
