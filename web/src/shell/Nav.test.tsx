// @vitest-environment jsdom
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./dialogs', () => ({ openDialog: vi.fn() }));
import { openDialog } from './dialogs';
import { Nav, SIDEBAR_KEY } from './Nav';

function renderNavAt(path: string) {
  const root = createRootRoute({ component: () => <><Nav /><Outlet /></> });
  const routes = ['/overview', '/capture', '/notes', '/note/$id', '/plan'].map(p => createRoute({ getParentRoute: () => root, path: p, component: () => null }));
  const router = createRouter({ routeTree: root.addChildren(routes), history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('Nav', () => {
  it('shows Overview and Tasks with matching accessible names', async () => {
    renderNavAt('/overview');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    const links = [...nav.querySelectorAll('a')];
    expect(links.map(a => a.textContent)).toEqual(['Overview', 'Tasks']);
    for (const name of ['Overview', 'Tasks']) expect(screen.getByRole('link', { name })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('href')).toBe('/plan');
  });

  it('marks Overview current while a legacy note link is open', async () => {
    renderNavAt('/note/abc');
    expect((await screen.findByRole('link', { name: 'Overview' })).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBeNull();
  });

  it('collapses to icons, keeps accessible names and remembers the choice', async () => {
    renderNavAt('/overview');
    fireEvent.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
    expect(document.querySelector('.sidebar')!.getAttribute('data-collapsed')).toBe('true');
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('1');
    expect(screen.getByRole('link', { name: 'Overview' })).toBeTruthy();
    cleanup();
    renderNavAt('/overview');
    expect((await screen.findByRole('button', { name: 'Expand sidebar' })).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('0');
  });

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    renderNavAt('/overview');
    fireEvent.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
    expect(document.querySelector('.sidebar')!.getAttribute('data-collapsed')).toBe('true');
  });

  it('opens Settings', async () => {
    renderNavAt('/overview');
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(openDialog).toHaveBeenCalledWith({ kind: 'settings' });
  });

  it('honours a collapsed flag stored under the pre-rename key until the next toggle', async () => {
    expect(SIDEBAR_KEY).toBe('dhara-sidebar-collapsed');
    localStorage.setItem('noema-sidebar-collapsed', '1');   // rename-shim: legacy key
    renderNavAt('/overview');
    fireEvent.click(await screen.findByRole('button', { name: 'Expand sidebar' }));
    expect(document.querySelector('.sidebar')!.getAttribute('data-collapsed')).toBe('false');
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('0');
  });
});
