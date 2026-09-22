import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { icon, ICON_NAMES } from '../src/ui/icons.js';
import { Raw } from '../src/ui/dom.js';

describe('icon', () => {
  it('references a sprite symbol and hides itself from assistive tech', () => {
    const out = icon('star', { cls: 'is-filled' });
    expect(out).toBeInstanceOf(Raw);
    expect(String(out)).toBe('<svg class="icon is-filled" aria-hidden="true" focusable="false"><use href="#i-star"></use></svg>');
    expect(String(icon('plus'))).toBe('<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-plus"></use></svg>');
  });
  it('throws on unknown names so typos fail loudly', () => {
    expect(() => icon('nope')).toThrow('Unknown icon: nope');
  });
});

describe('sprite', () => {
  it('contains every icon, both in sprite.svg and inlined in index.html', () => {
    expect(existsSync('assets/icons/sprite.svg')).toBe(true);
    const sprite = readFileSync('assets/icons/sprite.svg', 'utf8');
    const index = readFileSync('index.html', 'utf8');
    for (const n of ICON_NAMES) {
      expect(sprite).toContain(`id="i-${n}"`);
      expect(index).toContain(`id="i-${n}"`);
    }
  });
});
