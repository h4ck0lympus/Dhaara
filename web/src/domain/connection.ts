import { useSyncExternalStore } from 'react';
import { SERVICE_DOWN } from '../events';

export type ConnectionEvent = 'state-success' | 'state-failure' | 'network-error' | 'offline' | 'service-down';

export function nextConnected(_current: boolean, event: ConnectionEvent): boolean {
  return event === 'state-success';
}

let connected = false;
const listeners = new Set<() => void>();

export const connection = {
  get(): boolean {
    return connected;
  },
  report(event: ConnectionEvent): void {
    const next = nextConnected(connected, event);
    if (next === connected) return;
    connected = next;
    for (const listener of [...listeners]) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useConnected(): boolean {
  return useSyncExternalStore(connection.subscribe, connection.get, connection.get);
}

export function installConnectionListeners(win: Window = window): () => void {
  const offline = () => connection.report('offline');
  const serviceDown = () => connection.report('service-down');
  win.addEventListener('offline', offline);
  win.addEventListener(SERVICE_DOWN, serviceDown);
  return () => {
    win.removeEventListener('offline', offline);
    win.removeEventListener(SERVICE_DOWN, serviceDown);
  };
}
