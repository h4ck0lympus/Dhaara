import { describe, expect, it } from 'vitest';
import { COPY, greeting } from './copy';

describe('Notebook copy', () => {
  it('uses compact functional headings', () => {
    expect(COPY).toEqual({
      tagline: 'Same chaos. A calmer you.',
      capture: { title: 'Capture', subtitle: 'Write, record, or sketch. Organize later.' },
      plan: { title: 'Tasks' },
    });
  });
});

describe('greeting', () => {
  it('greeting follows the device clock and display_name', () => {
    const cases: [number, string][] = [[0, 'Good morning'], [11, 'Good morning'], [12, 'Good afternoon'], [17, 'Good afternoon'], [18, 'Good evening'], [23, 'Good evening']];
    for (const [hour, part] of cases) expect(greeting(new Date(2026, 9, 10, hour, 30), 'Vishal')).toBe(`${part}, Vishal.`);
  });

  it('trims the name', () => {
    expect(greeting(new Date(2026, 9, 10, 9), '  Vishal  ')).toBe('Good morning, Vishal.');
  });

  it('greeting omits an empty display_name', () => {
    expect(greeting(new Date(2026, 9, 10, 14), '')).toBe('Good afternoon.');
    expect(greeting(new Date(2026, 9, 10, 14), '   ')).toBe('Good afternoon.');
  });
});

