// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Swirl, Waves } from './Ambient';

afterEach(cleanup);

describe('Ambient', () => {
  it('is decorative and carries the motion setting for CSS', () => {
    const { container, rerender } = render(<><Waves motion /><Swirl motion /></>);
    for (const el of container.children) expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('.ambient-waves path')).toHaveLength(7);
    expect(container.querySelector('.ambient-waves')!.getAttribute('data-motion')).toBe('true');
    rerender(<><Waves motion={false} /><Swirl motion={false} /></>);
    expect(container.querySelector('.ambient-waves')!.getAttribute('data-motion')).toBe('false');
    expect(container.querySelector('.ambient-swirl')!.getAttribute('data-motion')).toBe('false');
  });
});
