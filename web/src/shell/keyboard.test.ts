// web/src/shell/keyboard.test.ts
// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDialog, openDialog } from './dialogs';
import { installKeyboard } from './keyboard';
import { cancelUnlock, requestUnlock } from './unlock';

let navigate: ReturnType<typeof vi.fn<(to: string) => void>>;
let uninstall: () => void;
beforeEach(() => { navigate = vi.fn<(to: string) => void>(); uninstall = installKeyboard(navigate); });
afterEach(() => { uninstall(); act(() => { closeDialog(); cancelUnlock(); }); document.body.innerHTML = ''; vi.useRealTimers(); });

const press = (init: KeyboardEventInit, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe('n opens Capture', () => {
  it('navigates with no modifier, outside fields, with no dialog', () => {
    const event = press({ key: 'n' });
    expect(navigate).toHaveBeenCalledWith('/capture');
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }])('ignores %j', init => {
    press({ key: 'n', ...init });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores Shift+n', () => {
    press({ key: 'n', shiftKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores key "N" (CapsLock or Shift)', () => {
    press({ key: 'N' });
    press({ key: 'N', shiftKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['input', 'textarea', 'select'])('ignores typing in a %s', tag => {
    const field = document.createElement(tag);
    document.body.append(field);
    field.focus();
    press({ key: 'n' }, field);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores contenteditable regions', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.tabIndex = 0;
    document.body.append(editor);
    editor.focus();
    press({ key: 'n' }, editor);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores n while a dialog or Unlock is open', () => {
    act(() => openDialog({ kind: 'task-capture' }));
    press({ key: 'n' });
    act(() => { closeDialog(); requestUnlock(); });
    press({ key: 'n' });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('Ctrl/Cmd+K opens search', () => {
  it.each([{ ctrlKey: true }, { metaKey: true }])('%j navigates to Notes and focuses #note-search', init => {
    vi.useFakeTimers();
    const search = document.createElement('input');
    search.id = 'note-search';
    document.body.append(search);
    const event = press({ key: 'k', ...init });
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/notes');
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(search);
  });

  it('stops after uninstall', () => {
    uninstall();
    press({ key: 'k', ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
    uninstall = () => {};
  });
});
