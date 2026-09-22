// @ts-check
import { raw, escapeHTML } from './dom.js';

/** Lucide icon names shipped in the inline sprite (see scripts/make-sprite.mjs). */
export const ICON_NAMES = [
  'plus', 'search', 'bell', 'settings', 'star', 'calendar', 'calendar-plus', 'clock', 'repeat', 'tag',
  'trash-2', 'undo-2', 'pencil', 'chevron-left', 'chevron-right', 'chevron-down', 'x', 'check',
  'download', 'upload', 'sun', 'moon', 'monitor', 'log-out', 'circle-alert', 'external-link',
  'arrow-up', 'arrow-down', 'info', 'cloud-off', 'user',
];

/**
 * An inline SVG that references a sprite symbol. Decorative by default:
 * the button or link around it carries the accessible name.
 * @param {string} name @param {{ cls?: string }} [opts]
 */
export function icon(name, { cls = '' } = {}) {
  if (!ICON_NAMES.includes(name)) throw new Error(`Unknown icon: ${name}`);
  const c = cls ? ` ${escapeHTML(cls)}` : '';
  return raw(`<svg class="icon${c}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`);
}
