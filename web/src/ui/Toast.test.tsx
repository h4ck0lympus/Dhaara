// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from './Toast';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('toast (Phase-1 stand-in)', () => {
  it('announces status politely, errors as alerts, one at a time, hidden after 5500 ms', () => {
    vi.useFakeTimers();
    toast('Saved to Inbox. Original preserved.');
    expect(document.querySelectorAll('#noema-toast')).toHaveLength(1);
    expect(document.querySelector('[role="status"][aria-live="polite"]')?.textContent).toBe('Saved to Inbox. Original preserved.');
    toast('Cannot read the local capture queue.', { tone: 'error' });
    expect(document.querySelectorAll('#noema-toast')).toHaveLength(1);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Cannot read the local capture queue.');
    vi.advanceTimersByTime(5499);
    expect(document.querySelector('#noema-toast')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('#noema-toast')).toBeNull();
  });
});
