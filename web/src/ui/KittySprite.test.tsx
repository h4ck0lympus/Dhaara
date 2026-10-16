// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KittySprite } from './KittySprite';

const fills: string[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  fills.length = 0;
  const ctx = { clearRect: vi.fn(), fillRect: vi.fn(), set fillStyle(v: string) { fills.push(v); } };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('KittySprite', () => {
  it('draws the sprite with a count badge and scales to the width', () => {
    render(<KittySprite status={{ state: 'needs-you', count: 3, summary: '' }} width={104} />);
    const kitty = screen.getByRole('img', { name: 'Kitty alert: 3 need you' });
    expect([kitty.style.width, kitty.style.height]).toEqual(['104px', '60px']);
    expect(kitty.textContent).toBe('3');
    expect(fills).toContain('#ffffff');
  });

  it('purrs with hearts while petted, and stops when the pointer leaves', () => {
    const { container } = render(<KittySprite status={{ state: 'working', count: 0, summary: '' }} width={52} />);
    const kitty = screen.getByRole('img');
    fireEvent.pointerEnter(kitty);
    expect(kitty.getAttribute('aria-label')).toBe('Kitty purring: happy to be petted');
    expect(container.querySelectorAll('.kitty-heart')).toHaveLength(2);
    expect(container.querySelector('canvas')!.className).toContain('purring');
    fireEvent.pointerLeave(kitty);
    expect(container.querySelectorAll('.kitty-heart')).toHaveLength(0);
  });

  it('animates frames over time unless motion is off', () => {
    const { container, rerender } = render(<KittySprite status={{ state: 'needs-you', count: 1, summary: '' }} width={52} />);
    const canvas = () => container.querySelector('canvas')!;
    expect(canvas().style.transform).toBe('');
    act(() => { vi.advanceTimersByTime(420); });
    expect(canvas().style.transform).toBe('translateY(-2px)');
    rerender(<KittySprite status={{ state: 'needs-you', count: 1, summary: '' }} width={52} motion={false} />);
    act(() => { vi.advanceTimersByTime(420 * 3); });
    expect(canvas().style.transform).toBe('translateY(-2px)');
  });

  it('offline is grey, still, dashed badge and never purrs', () => {
    const { container } = render(<KittySprite status={{ state: 'offline', count: 0, summary: '' }} width={52} />);
    const kitty = screen.getByRole('img');
    fireEvent.pointerEnter(kitty);
    expect(kitty.getAttribute('aria-label')).toBe('Kitty dimmed: Dhara is offline');
    expect(container.querySelectorAll('.kitty-heart')).toHaveLength(0);
    expect(kitty.style.opacity).toBe('0.6');
    expect(fills).toContain('#c9ccd2');
    expect(kitty.textContent).toBe('–');
  });
});
