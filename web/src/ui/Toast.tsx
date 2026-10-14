import { useEffect, useRef, useSyncExternalStore, type JSX } from 'react';
import { createStore } from '../state/store';
import { Icon } from './Icon';

export type ToastOptions = { action?: { label: string; onClick: () => void }; tone?: 'status' | 'error' };
type Current = { id: number; message: string; options: ToastOptions };

export const TOAST_MS = 5500; // public/app.js:15

const store = createStore<Current | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
// Popover API is feature-detected: engines without it get a plain fixed layer.
const hasPopover = () => typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

export function toast(message: string, options: ToastOptions = {}): void {
  clearTimeout(timer);
  store.set({ id: ++seq, message, options });
  timer = setTimeout(dismissToast, TOAST_MS);
}

export function dismissToast(): void {
  clearTimeout(timer);
  store.set(null);
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toastError(error: unknown): void {
  toast(messageOf(error), { tone: 'error' });
}

export function ToastHost(): JSX.Element {
  const active = useSyncExternalStore(store.subscribe, store.get);
  const layer = useRef<HTMLDivElement>(null);
  const popover = hasPopover();
  useEffect(() => {
    const el = layer.current;
    if (!popover || !el) return;
    // Re-showing puts the toast above any modal dialog opened since (top-layer order).
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
  }, [active, popover]);
  const action = active?.options.action;
  const body = active && (
    <div className="toast" key={active.id}>
      <span>{active.message}</span>
      {action && <button type="button" className="text-button" onClick={() => { dismissToast(); action.onClick(); }}>{action.label}</button>}
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={dismissToast}><Icon name="close" size={16} /></button>
    </div>
  );
  const isError = active?.options.tone === 'error';
  return (
    <div ref={layer} {...(popover ? { popover: 'manual' } : {})} className="toast-layer">
      <div role="status" aria-live="polite">{!isError && body}</div>
      <div role="alert">{isError && body}</div>
    </div>
  );
}
