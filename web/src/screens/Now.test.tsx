// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot, makeTask } from '../test/fixtures';
const h = vi.hoisted(() => ({ navigate: vi.fn(), setFocus: vi.fn().mockResolvedValue({}) }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }));
vi.mock('../state/queries', () => ({ useSnapshot: vi.fn(), useSetFocus: () => ({ mutateAsync: h.setFocus }) }));
vi.mock('../domain/connection', () => ({ useConnected: () => true }));
vi.mock('../shell/dialogs', () => ({ openDialog: vi.fn() }));
vi.mock('../shell/OfflineNotice', () => ({ OfflineNotice: () => null }));
vi.mock('../routes/guards', () => ({ allowNavigation: vi.fn(() => true) }));
vi.mock('./Capture', () => ({ CaptureScreen: () => <textarea aria-label="Inline note" /> }));
vi.mock('./Notes', () => ({ NotesScreen: () => <p>Inline library</p> }));
vi.mock('./NoteView', () => ({ EmbeddedNote: () => <p>Inline note reader</p> }));
vi.mock('../dialogs/TaskCapture', () => ({ TaskCaptureDialog: () => <textarea aria-label="Inline task" /> }));
import { useSnapshot } from '../state/queries';
import { allowNavigation } from '../routes/guards';
import { NowScreen } from './Now';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function given(snapshot = makeSnapshot()) {
  vi.mocked(useSnapshot).mockReturnValue({ data: snapshot } as ReturnType<typeof useSnapshot>);
  return render(<NowScreen />);
}
describe('Overview workspace', () => {
  it('caps a large available list and opens the complete filtered workspace', () => {
    const tasks = Array.from({ length: 80 }, (_, i) => makeTask(`t${i}`, { title: `Task ${i}` }));
    given(makeSnapshot({ tasks, available: tasks }));
    const available = screen.getByRole('region', { name: 'Available next' });
    expect(available.querySelectorAll('.preview-row')).toHaveLength(3);
    fireEvent.click(within(available).getByRole('button', { name: 'View available tasks' }));
    expect(h.navigate).toHaveBeenCalledWith({ to: '/plan', search: { view: 'available' } });
  });
  it('opens capture, tasks and notes inside Overview', () => {
    given();
    fireEvent.click(screen.getByRole('button', { name: 'Capture a thought…' }));
    expect(screen.getByLabelText('Inline note')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ Task' }));
    expect(screen.getByLabelText('Inline task')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Browse notes' }));
    expect(screen.getByText('Inline library')).toBeTruthy();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
  });
  it('honors inline navigation guards before replacing an editor', () => {
    given();
    fireEvent.click(screen.getByRole('button', { name: 'Capture a thought…' }));
    vi.mocked(allowNavigation).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '+ Task' }));
    expect(screen.getByLabelText('Inline note')).toBeTruthy();
    expect(screen.queryByLabelText('Inline task')).toBeNull();
  });
  it('does not repeat attention tasks in Available next or expose session hashes', () => {
    const task = makeTask('t', { title: 'Codex · g-p-6ac822bb03588191b51d07108e212526 · 7fab3c' });
    given(makeSnapshot({ tasks: [task], attention: [task], available: [task] }));
    expect(screen.getByText('Codex session')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Available next' }).querySelectorAll('.preview-row')).toHaveLength(0);
  });
});
