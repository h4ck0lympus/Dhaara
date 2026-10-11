// web/src/shell/keyboard.ts
import { isDialogOpen } from './dialogs';
import { isUnlockOpen } from './unlock';

function isField(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
    || element.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

export function installKeyboard(navigate: (to: string) => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k'
      && !isDialogOpen() && !isUnlockOpen()) {
      event.preventDefault();
      navigate('/notes');
      setTimeout(() => document.querySelector<HTMLInputElement>('#note-search')?.focus(), 100); // app.js:563
      return;
    }
    if (event.key === 'n' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
      && !isField(document.activeElement) && !isDialogOpen() && !isUnlockOpen()) {
      event.preventDefault();
      navigate('/capture');
    }
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
