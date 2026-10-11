import { describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

describe('createStore', () => {
  it('returns the initial value and the latest set value', () => {
    const store = createStore(1);
    expect(store.get()).toBe(1);
    store.set(2);
    expect(store.get()).toBe(2);
  });

  it('notifies subscribers after set, and stops after unsubscribe', () => {
    const store = createStore('a');
    const listener = vi.fn(() => expect(store.get()).toBe('b'));
    const off = store.subscribe(listener);
    store.set('b');
    expect(listener).toHaveBeenCalledOnce();
    off();
    store.set('c');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('supports several independent subscribers', () => {
    const store = createStore(0);
    const a = vi.fn(); const b = vi.fn();
    store.subscribe(a); const offB = store.subscribe(b);
    offB();
    store.set(1);
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
  });
});
