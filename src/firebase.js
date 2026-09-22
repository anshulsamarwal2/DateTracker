/**
 * Firebase initialisation. Together with db.js, the only module that imports the SDK.
 */
import { initializeApp } from '../vendor/firebase/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from '../vendor/firebase/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from '../vendor/firebase/firebase-firestore.js';
import { firebaseConfig } from './config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const REDIRECT_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);
const DISMISSED_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

/**
 * Sign in with Google. Always tries a popup first — including in an installed
 * (standalone) PWA, where a redirect through `authDomain` can silently fail in
 * browsers that partition third-party storage. Falls back to a redirect only
 * when the popup itself can't work.
 */
export async function signIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = /** @type {any} */ (err)?.code;
    if (REDIRECT_CODES.has(code)) return signInWithRedirect(auth, provider);
    if (DISMISSED_CODES.has(code)) return;
    throw err;
  }
}

/**
 * Finish a redirect sign-in if one is pending. Never rejects.
 * @returns {Promise<{ error: string } | null>} null on success or when no redirect was pending.
 */
export function completeRedirect() {
  return getRedirectResult(auth)
    .then(() => null)
    .catch((err) => {
      console.error(err);
      return { error: "Sign-in didn't complete. Please try again." };
    });
}

/** @param {(user: any) => void} cb */
export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export function signOutUser() {
  return signOut(auth);
}
