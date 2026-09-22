import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db.js', () => ({}));
vi.mock('../src/ui/compose.js', () => ({}));
vi.mock('../src/ui/toast.js', () => ({}));
vi.mock('../src/router.js', () => ({}));

const { icsFilename } = await import('../src/ui/entry-detail.js');

describe('icsFilename', () => {
  it('slugs titles and falls back', () => {
    expect(icsFilename('Car insurance renewal!')).toBe('car-insurance-renewal.ics');
    expect(icsFilename('Mum’s birthday 🎂')).toBe('mum-s-birthday.ics');
    expect(icsFilename('!!!')).toBe('reminder.ics');
    expect(icsFilename('x'.repeat(60))).toBe(`${'x'.repeat(40)}.ics`);
  });
});
