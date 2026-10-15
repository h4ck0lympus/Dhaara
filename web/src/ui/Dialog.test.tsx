// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { polyfillDialog } from './testing';

beforeAll(polyfillDialog);
afterEach(cleanup);

function renderDialog(onRequestClose = vi.fn(), closeLabel?: string) {
  render(<Dialog title="Edit task" onRequestClose={onRequestClose} closeLabel={closeLabel}><input data-autofocus="" aria-label="Title" /><p>Body</p></Dialog>);
  return { onRequestClose, dialog: screen.getByRole('dialog', { name: 'Edit task' }) as HTMLDialogElement };
}

describe('Dialog', () => {
  it('opens modally, is labelled by its title and marks a quiet surface', () => {
    const { dialog } = renderDialog();
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('focuses the data-autofocus control on open', () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  });

  it('turns Escape (cancel) into a close request and keeps the dialog open', () => {
    const { dialog, onRequestClose } = renderDialog();
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('requests close from the close button with the default label', () => {
    const { onRequestClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it('accepts a custom close label', () => {
    renderDialog(vi.fn(), 'Close Add task');
    expect(screen.getByRole('button', { name: 'Close Add task' })).toBeTruthy();
  });

  it('requests close on a backdrop click outside the box, not on clicks inside', () => {
    const { dialog, onRequestClose } = renderDialog();
    dialog.getBoundingClientRect = () => ({ left: 100, right: 300, top: 100, bottom: 300, width: 200, height: 200, x: 100, y: 100, toJSON: () => ({}) });
    fireEvent.click(screen.getByText('Body'), { clientX: 150, clientY: 150 });
    fireEvent.click(dialog, { clientX: 150, clientY: 150 });
    expect(onRequestClose).not.toHaveBeenCalled();
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it('reopens and requests close if the browser closes it natively', () => {
    const { dialog, onRequestClose } = renderDialog();
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it('does not close itself on open under StrictMode (stale queued close event)', async () => {
    const nativeClose = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      queueMicrotask(() => this.dispatchEvent(new Event('close')));
    };
    try {
      const onRequestClose = vi.fn();
      render(<StrictMode><Dialog title="Edit task" onRequestClose={onRequestClose}><p>Body</p></Dialog></StrictMode>);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onRequestClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true);
    } finally {
      HTMLDialogElement.prototype.close = nativeClose;
    }
  });

  it('restores focus to the opener when it unmounts', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        {open && <Dialog title="Details" onRequestClose={() => setOpen(false)}><button type="button" data-autofocus="">Inside</button></Dialog>}
      </>;
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByText('Inside')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
