import { isDialogOpen, openDialog } from './dialogs';
import { isUnlockOpen } from './unlock';

export const CAPTURE_EVENT = 'dhara-open-capture';

function isField(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
    || element.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

export function installKeyboard(navigate: (to: string) => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented || isDialogOpen() || isUnlockOpen()) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      navigate('/overview');
      setTimeout(() => window.dispatchEvent(new CustomEvent(CAPTURE_EVENT)), 50);
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || isField(document.activeElement)) return;
    if (event.key === '/') {
      event.preventDefault();
      document.querySelector<HTMLInputElement>('#site-search')?.focus();
    } else if (event.key === 'n') {
      event.preventDefault();
      openDialog({ kind: 'task-capture' });
    }
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
