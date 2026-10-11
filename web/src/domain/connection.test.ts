import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_DOWN } from '../events';
import { connection, installConnectionListeners, nextConnected, type ConnectionEvent } from './connection';

afterEach(() => connection.report('offline'));

describe('nextConnected', () => {
  it('is true only after a successful state fetch, whatever the current value', () => {
    const events: ConnectionEvent[] = ['state-success', 'state-failure', 'network-error', 'offline', 'service-down'];
    for (const current of [true, false]) {
      expect(events.map((event) => nextConnected(current, event))).toEqual([true, false, false, false, false]);
    }
  });
});

describe('connection', () => {
  it('starts disconnected and notifies subscribers only when the value changes', () => {
    expect(connection.get()).toBe(false);
    const listener = vi.fn();
    const unsubscribe = connection.subscribe(listener);
    connection.report('state-success');
    connection.report('state-success');
    expect(connection.get()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    connection.report('network-error');
    expect(connection.get()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    connection.report('state-success');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('drops to disconnected on offline and on the desktop service-down event, but online alone never reconnects', () => {
    const win = new EventTarget() as unknown as Window;
    const uninstall = installConnectionListeners(win);
    connection.report('state-success');
    win.dispatchEvent(new Event('offline'));
    expect(connection.get()).toBe(false);
    win.dispatchEvent(new Event('online'));
    expect(connection.get()).toBe(false);
    connection.report('state-success');
    win.dispatchEvent(new Event(SERVICE_DOWN));
    expect(connection.get()).toBe(false);
    uninstall();
    connection.report('state-success');
    win.dispatchEvent(new Event('offline'));
    expect(connection.get()).toBe(true);
  });
});
