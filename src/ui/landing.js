import { html, raw, setHTML, delegate } from './dom.js';
import { icon } from './icons.js';
import { signIn } from '../firebase.js';

/** The app mark (same geometry as assets/icons/favicon.svg). */
export function logoMark() {
  return raw('<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="var(--accent)"/><circle cx="32" cy="32" r="15" fill="none" stroke="var(--on-accent)" stroke-width="5"/><circle cx="32" cy="32" r="5" fill="var(--on-accent)"/></svg>');
}

/** @param {HTMLElement} root */
export function mountLanding(root) {
  let error = '';
  let busy = false;
  const render = () => setHTML(root, html`
    <main class="landing">
      ${logoMark()}
      <h1 class="landing-title">DateTracker</h1>
      <p class="landing-tagline">Moments worth remembering.</p>
      <ul class="landing-features">
        <li>${icon('calendar')}<span>A private journal of the moments that matter</span></li>
        <li>${icon('clock')}<span>On this day — what happened in years past</span></li>
        <li>${icon('bell')}<span>Reminders for renewals &amp; anniversaries</span></li>
      </ul>
      ${navigator.onLine
        ? html`<button type="button" class="btn btn-primary btn-block landing-cta" data-action="signin" ${busy ? 'disabled' : ''}>Continue with Google</button>`
        : html`<p class="landing-offline">${icon('cloud-off')}<span>You're offline — connect to sign in.</span></p>`}
      ${error ? html`<p class="field-error landing-error" role="alert">${error}</p>` : ''}
      <p class="landing-foot">Private · Free · No ads</p>
    </main>`);

  const off = delegate(root, 'click', {
    signin: () => {
      busy = true; error = ''; render();
      signIn()
        .catch((err) => { console.error(err); error = 'Sign-in failed. Please try again.'; })
        .finally(() => { busy = false; if (root.isConnected) render(); });
    },
  });
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
  return {
    unmount() {
      off();
      window.removeEventListener('online', render);
      window.removeEventListener('offline', render);
    },
  };
}

/** @param {HTMLElement} root */
export function mountLoading(root) {
  setHTML(root, html`
    <main class="boot" aria-busy="true">
      ${logoMark()}
      <p class="boot-title">DateTracker</p>
      <div class="spinner" role="progressbar" aria-label="Loading"></div>
    </main>`);
  return { unmount() {} };
}

/** @param {HTMLElement} root @param {{ message: string, onRetry: () => void }} opts */
export function mountError(root, { message, onRetry }) {
  setHTML(root, html`
    <main class="boot">
      ${icon('circle-alert', { cls: 'boot-alert' })}
      <h1 class="boot-title">Couldn't load your journal</h1>
      <p class="boot-message">${message}</p>
      <button type="button" class="btn btn-primary" data-action="retry">Retry</button>
    </main>`);
  const off = delegate(root, 'click', { retry: () => onRetry() });
  return { unmount: off };
}
