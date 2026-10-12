// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '../ui/testing';

const { stub } = vi.hoisted(() => ({ stub: () => <dialog open /> }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../local/outbox', () => ({ useOutboxItems: () => ({ items: [], reload: vi.fn() }), retryItem: vi.fn(), discardItem: vi.fn() }));
vi.mock('../capture/Sketch', () => ({ SketchDialog: stub }));
vi.mock('../dialogs/TaskDetail', () => ({ TaskDetailDialog: stub }));
vi.mock('../dialogs/TaskCapture', () => ({ TaskCaptureDialog: stub }));
import { DialogHost } from './DialogHost';
import { closeDialog, openDialog, type DialogRequest } from './dialogs';

// Record<kind, ...> makes this table exhaustive at compile time. 'pending' arms still render nothing (Phase 2b Tasks 12-13); flip them to a request when they land.
const requests: Record<DialogRequest['kind'], DialogRequest | 'pending'> = {
  task: { kind: 'task', id: 't1' },
  'task-capture': { kind: 'task-capture' },
  sketch: { kind: 'sketch' },
  outbox: { kind: 'outbox' },
  settings: 'pending',
  'note-history': 'pending',
};

beforeAll(polyfillDialog);
afterEach(() => { cleanup(); act(closeDialog); });

describe('DialogHost', () => {
  it.each(Object.entries(requests))('%s renders a <dialog> (or nothing while pending)', (_kind, request) => {
    const { container } = render(<DialogHost />);
    expect(container.querySelector('dialog')).toBeNull();
    if (request === 'pending') return;
    act(() => openDialog(request));
    expect(container.querySelector('dialog')).not.toBeNull();
  });
});
