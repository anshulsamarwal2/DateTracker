import { describe, it, expect, vi, beforeEach } from 'vitest';

const fx = vi.hoisted(() => ({
  popupResult: null,
  popupError: null,
  redirectResult: null,
  redirectError: null,
}));

vi.mock('../vendor/firebase/firebase-app.js', () => ({ initializeApp: () => ({}) }));
vi.mock('../vendor/firebase/firebase-firestore.js', () => ({
  initializeFirestore: () => ({}),
  persistentLocalCache: () => ({}),
  persistentMultipleTabManager: () => ({}),
}));
vi.mock('../vendor/firebase/firebase-auth.js', () => ({
  getAuth: () => ({}),
  GoogleAuthProvider: class { setCustomParameters() {} },
  signInWithPopup: vi.fn(async () => {
    if (fx.popupError) throw fx.popupError;
    return fx.popupResult;
  }),
  signInWithRedirect: vi.fn(async () => {}),
  getRedirectResult: vi.fn(async () => {
    if (fx.redirectError) throw fx.redirectError;
    return fx.redirectResult;
  }),
  onAuthStateChanged: vi.fn(() => () => {}),
  signOut: vi.fn(async () => {}),
}));

const auth = await import('../vendor/firebase/firebase-auth.js');
const fb = await import('../src/firebase.js');

beforeEach(() => {
  fx.popupResult = {}; fx.popupError = null;
  fx.redirectResult = null; fx.redirectError = null;
  vi.clearAllMocks();
});

describe('signIn', () => {
  it('always tries the popup first, even where a standalone display-mode used to short-circuit to redirect', async () => {
    await fb.signIn();
    expect(auth.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(auth.signInWithRedirect).not.toHaveBeenCalled();
  });
  it('falls back to redirect only for the known redirect-worthy error codes', async () => {
    fx.popupError = Object.assign(new Error('x'), { code: 'auth/popup-blocked' });
    await fb.signIn();
    expect(auth.signInWithRedirect).toHaveBeenCalledTimes(1);
  });
  it('resolves quietly when the user dismisses the popup', async () => {
    fx.popupError = Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' });
    await expect(fb.signIn()).resolves.toBeUndefined();
    expect(auth.signInWithRedirect).not.toHaveBeenCalled();
  });
  it('rethrows any other error', async () => {
    fx.popupError = Object.assign(new Error('nope'), { code: 'auth/network-request-failed' });
    await expect(fb.signIn()).rejects.toThrow('nope');
  });
});

describe('completeRedirect', () => {
  it('resolves null on success or when no redirect is pending', async () => {
    fx.redirectResult = null;
    await expect(fb.completeRedirect()).resolves.toBeNull();
    fx.redirectResult = { user: {} };
    await expect(fb.completeRedirect()).resolves.toBeNull();
  });
  it('resolves an error object on failure, logs it, and never rejects', async () => {
    const err = new Error('boom');
    fx.redirectError = err;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(fb.completeRedirect()).resolves.toEqual({ error: "Sign-in didn't complete. Please try again." });
    expect(spy).toHaveBeenCalledWith(err);
    spy.mockRestore();
  });
});
