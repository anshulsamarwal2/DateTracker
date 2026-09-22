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

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
}

/** Sign in with Google: popup, or redirect when popups can't work. */
export async function signIn() {
  if (isStandalone()) return signInWithRedirect(auth, provider);
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = /** @type {any} */ (err)?.code;
    if (REDIRECT_CODES.has(code)) return signInWithRedirect(auth, provider);
    if (DISMISSED_CODES.has(code)) return;
    throw err;
  }
}

/** Finish a redirect sign-in if one is pending. Never rejects. */
export function completeRedirect() {
  return getRedirectResult(auth).catch(() => null);
}

/** @param {(user: any) => void} cb */
export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export function signOutUser() {
  return signOut(auth);
}
