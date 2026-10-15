// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDialog, isDialogOpen, openDialog } from './dialogs';
import { CAPTURE_EVENT, installKeyboard } from './keyboard';
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
const focusNew = (tag: string) => { const el = document.createElement(tag); document.body.append(el); el.focus(); return el; };

describe('n opens New task', () => {
  it('opens the task dialog with no modifier, outside fields', () => {
    const event = press({ key: 'n' });
    expect(isDialogOpen()).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }])('ignores %j', init => {
    press({ key: 'n', ...init });
    expect(isDialogOpen()).toBe(false);
  });

  it('ignores key "N" (CapsLock)', () => {
    press({ key: 'N' });
    expect(isDialogOpen()).toBe(false);
  });

  it.each(['input', 'textarea', 'select'])('ignores typing in a %s', tag => {
    press({ key: 'n' }, focusNew(tag));
    expect(isDialogOpen()).toBe(false);
  });

  it('ignores contenteditable regions', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.tabIndex = 0;
    document.body.append(editor);
    editor.focus();
    press({ key: 'n' }, editor);
    expect(isDialogOpen()).toBe(false);
  });

  it('ignores n while Unlock is open', () => {
    act(() => requestUnlock());
    press({ key: 'n' });
    expect(isDialogOpen()).toBe(false);
  });
});

describe('/ focuses search', () => {
  it('focuses #site-search outside fields', () => {
    const search = document.createElement('input');
    search.id = 'site-search';
    document.body.append(search);
    const event = press({ key: '/' });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(search);
  });

  it('types a slash normally inside a field', () => {
    const search = document.createElement('input');
    search.id = 'site-search';
    document.body.append(search);
    const field = focusNew('textarea');
    expect(press({ key: '/' }, field).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it('is ignored while a dialog is open', () => {
    act(() => openDialog({ kind: 'outbox' }));
    expect(press({ key: '/' }).defaultPrevented).toBe(false);
  });
});

describe('Ctrl/Cmd+K opens capture', () => {
  it('is ignored while a dialog or Unlock is open', () => {
    act(() => openDialog({ kind: 'task-capture' }));
    const event = press({ key: 'k', ctrlKey: true });
    act(() => { closeDialog(); requestUnlock(); });
    press({ key: 'k', metaKey: true });
    expect(navigate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])('%j goes Home and asks it to open capture, even from a field', init => {
    vi.useFakeTimers();
    const heard = vi.fn();
    window.addEventListener(CAPTURE_EVENT, heard);
    const event = press({ key: 'k', ...init }, focusNew('input'));
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/overview');
    vi.advanceTimersByTime(50);
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(CAPTURE_EVENT, heard);
  });

  it('ignores Ctrl+Alt+K', () => {
    press({ key: 'k', ctrlKey: true, altKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stops after uninstall', () => {
    uninstall();
    press({ key: 'k', ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
    uninstall = () => {};
  });
});
