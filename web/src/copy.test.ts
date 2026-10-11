import { describe, expect, it } from 'vitest';
import { COPY, avatarLetter, greeting } from './copy';

describe('COPY (owner decision 18B: slogans kept)', () => {
  it('COPY keeps the variant B headings, subtitles and tagline verbatim', () => {
    expect(COPY).toEqual({
      tagline: 'Same chaos. A calmer you.',
      capture: { title: 'Capture a thought.', subtitle: 'A quiet place for the rough edges.' },
      notes: { title: 'A place to return to.', subtitle: 'Your notes, with their original thinking intact.' },
      plan: { title: 'A little room to plan.', subtitle: 'Keep the next step in view.' },
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

  it('greeting and avatar omit an empty display_name', () => {
    expect(greeting(new Date(2026, 9, 10, 14), '')).toBe('Good afternoon.');
    expect(greeting(new Date(2026, 9, 10, 14), '   ')).toBe('Good afternoon.');
    expect(avatarLetter('')).toBeNull();
    expect(avatarLetter('   ')).toBeNull();
  });
});

describe('avatarLetter', () => {
  it('upper-cases the first letter of the trimmed name', () => {
    expect(avatarLetter('vishal')).toBe('V');
    expect(avatarLetter('  élodie')).toBe('É');
  });

  it('keeps a surrogate pair whole', () => {
    expect(avatarLetter('😀 Sam')).toBe('😀');
  });
});
