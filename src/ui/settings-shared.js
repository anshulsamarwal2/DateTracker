import { html } from './dom.js';
import { icon } from './icons.js';
import { daysBetween, todayISO, toISODate } from '../dates.js';

/** A settings sub-screen: back button (data-action="back") + title + body. @param {string} title @param {import('./dom.js').Raw} body */
export function sectionScreen(title, body) {
  return html`
    <main class="screen settings-section">
      <header class="topbar">
        <button type="button" class="icon-btn" data-action="back" aria-label="Back to settings">${icon('chevron-left')}</button>
        <h1 class="topbar-title">${title}</h1>
      </header>
      ${body}
    </main>`;
}

/** @param {{ lastBackupAt: number|null } | null} meta @param {Date} [now] */
export function lastBackupLabel(meta, now = new Date()) {
  if (!meta?.lastBackupAt) return 'Never backed up';
  const days = daysBetween(toISODate(new Date(meta.lastBackupAt)), todayISO(now));
  if (days <= 0) return 'Last backup: today';
  if (days === 1) return 'Last backup: yesterday';
  return `Last backup: ${days} days ago`;
}
