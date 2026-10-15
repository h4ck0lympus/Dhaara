// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Icon } from './Icon';
import { TOAST_MS, ToastHost, dismissToast, messageOf, toast, toastError } from './Toast';

afterEach(() => {
  act(() => dismissToast());
  cleanup();
  vi.useRealTimers();
});

describe('Icon', () => {
  it('renders a decorative 20 px svg by default', () => {
    const { container } = render(<Icon name="sidebar" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.childElementCount).toBeGreaterThan(0);
  });
});

describe('toast', () => {
  it('announces status toasts politely', () => {
    render(<ToastHost />);
    act(() => toast('Task added.'));
    expect(screen.getByRole('status').textContent).toContain('Task added.');
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('puts error toasts in an alert region', () => {
    render(<ToastHost />);
    act(() => toastError(new Error('Boom')));
    expect(screen.getByRole('alert').textContent).toContain('Boom');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('runs the action and clears the toast', () => {
    const onClick = vi.fn();
    render(<ToastHost />);
    act(() => toast('Task added.', { action: { label: 'Edit', onClick } }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Task added.')).toBeNull();
  });

  it('shows one toast at a time; the next replaces it', () => {
    render(<ToastHost />);
    act(() => toast('First'));
    act(() => toast('Second'));
    expect(screen.queryByText('First')).toBeNull();
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('hides after 5500 ms (app.js:15)', () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => toast('Saved'));
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(screen.queryByText('Saved')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('can be dismissed explicitly', () => {
    render(<ToastHost />);
    act(() => toast('Saved'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('messageOf reads Error messages and stringifies the rest', () => {
    expect(messageOf(new Error('x'))).toBe('x');
    expect(messageOf('y')).toBe('y');
  });
});
