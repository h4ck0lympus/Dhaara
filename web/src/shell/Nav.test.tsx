// @vitest-environment jsdom
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Nav } from './Nav';

function renderNavAt(path: string) {
  const root = createRootRoute({ component: () => <><Nav /><Outlet /></> });
  const routes = ['/overview', '/capture', '/notes', '/note/$id', '/plan', '/task/$id', '/settings'].map(p => createRoute({ getParentRoute: () => root, path: p, component: () => null }));
  const router = createRouter({ routeTree: root.addChildren(routes), history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const current = () => screen.getAllByRole('link').filter(a => a.getAttribute('aria-current') === 'page').map(a => a.textContent);

describe('Nav', () => {
  it('shows Home, Notes and Tasks in order with their routes', async () => {
    renderNavAt('/overview');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect([...nav.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')])).toEqual([['Home', '/overview'], ['Notes', '/notes'], ['Tasks', '/plan']]);
  });

  it.each([
    ['/overview', ['Home']], ['/capture', ['Home']], ['/notes', ['Notes']], ['/note/abc', ['Notes']],
    ['/plan', ['Tasks']], ['/task/abc', ['Tasks']], ['/settings', []],
  ])('at %s marks %j current', async (path, expected) => {
    renderNavAt(path);
    await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(current()).toEqual(expected);
  });
});
