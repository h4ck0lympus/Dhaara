// @vitest-environment jsdom
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));
import { toast } from '../ui/Toast';
import { RouteGuards, allowNavigation, isGuardActive, registerGuard, shouldWarnBeforeUnload, useNavigationGuard, type NavigationGuard } from './guards';

const recording: NavigationGuard = {
  id: 'recording', beforeUnload: true,
  check: to => (to !== '/capture' ? { kind: 'block', toast: 'Stop recording before leaving Capture.' } : null),
};
const noteEdit: NavigationGuard = {
  id: 'note-edit', beforeUnload: true,
  check: () => ({ kind: 'confirm', message: 'Leave without saving this note edit? The last saved revision remains safe.' }),
};
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); cleanup(); vi.restoreAllMocks(); vi.mocked(toast).mockClear(); });

describe('guard registry', () => {
  it('allows everything with no guards', () => {
    expect(allowNavigation('/notes')).toBe(true);
    expect(shouldWarnBeforeUnload()).toBe(false);
  });

  it('blocks with the guard toast', () => {
    cleanups.push(registerGuard(recording));
    expect(isGuardActive('recording')).toBe(true);
    expect(allowNavigation('/capture')).toBe(true);
    expect(allowNavigation('/notes')).toBe(false);
    expect(toast).toHaveBeenCalledWith('Stop recording before leaving Capture.');
    expect(shouldWarnBeforeUnload()).toBe(true);
  });

  it('asks for confirmation and respects the answer', () => {
    cleanups.push(registerGuard(noteEdit));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(allowNavigation('/plan')).toBe(false);
    expect(allowNavigation('/plan')).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Leave without saving this note edit? The last saved revision remains safe.');
  });

  it('an old unregister never removes a newer guard with the same id', () => {
    const first = registerGuard(recording);
    const second = registerGuard({ ...recording });
    first();
    expect(isGuardActive('recording')).toBe(true);
    second();
    expect(isGuardActive('recording')).toBe(false);
  });

  it('useNavigationGuard registers only while mounted and non-null', () => {
    const hook = renderHook(({ guard }) => useNavigationGuard(guard), { initialProps: { guard: null as NavigationGuard | null } });
    expect(isGuardActive('recording')).toBe(false);
    hook.rerender({ guard: recording });
    expect(isGuardActive('recording')).toBe(true);
    hook.unmount();
    expect(isGuardActive('recording')).toBe(false);
  });
});

describe('RouteGuards', () => {
  it('blocks router navigation that a guard refuses', async () => {
    const root = createRootRoute({ component: () => <><RouteGuards /><Outlet /></> });
    const overview = createRoute({ getParentRoute: () => root, path: '/overview', component: () => <p>Overview page</p> });
    const plan = createRoute({ getParentRoute: () => root, path: '/plan', component: () => <p>Plan page</p> });
    const router = createRouter({ routeTree: root.addChildren([overview, plan]), history: createMemoryHistory({ initialEntries: ['/overview'] }) });
    render(<RouterProvider router={router} />);
    await screen.findByText('Overview page');
    cleanups.push(registerGuard(recording));
    // a blocked navigate() never settles, so fire it and flush instead of awaiting
    void router.navigate({ to: '/plan' });
    await act(async () => {});
    expect(router.state.location.pathname).toBe('/overview');
    expect(toast).toHaveBeenCalledWith('Stop recording before leaving Capture.');
  });
});
