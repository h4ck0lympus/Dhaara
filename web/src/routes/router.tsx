import type { QueryClient } from '@tanstack/react-query';
import { createHashHistory, createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, type JSX } from 'react';
import type { Snapshot } from '../api/schemas';
import { CaptureScreen } from '../screens/Capture';
import { NotesScreen } from '../screens/Notes';
import { NowScreen } from '../screens/Now';
import { PlanScreen } from '../screens/Plan';
import { AppShell } from '../shell/AppShell';
import { openDialog, type DialogRequest } from '../shell/dialogs';
import { useSnapshot } from '../state/queries';
import { S } from '../strings';
import { toast } from '../ui/Toast';

export function openModalLink(request: DialogRequest, snapshot: Snapshot | undefined): void {
  if (request.kind === 'task' && !snapshot?.tasks.some(t => t.id === request.id)) {
    toast(S.taskUnavailable);
    return;
  }
  openDialog(request);
}

function TaskLinkScreen(): JSX.Element {
  const { id } = taskRoute.useParams();
  const snapshot = useSnapshot().data;
  const navigate = useNavigate();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !snapshot) return;
    handled.current = true;
    openModalLink({ kind: 'task', id }, snapshot);
    void navigate({ to: '/plan', replace: true });
  }, [snapshot, id, navigate]);
  return <PlanScreen />;
}

function SettingsLinkScreen(): JSX.Element {
  const navigate = useNavigate();
  useEffect(() => {
    openDialog({ kind: 'settings' });
    void navigate({ to: '/overview', replace: true });
  }, [navigate]);
  return <NowScreen />;
}

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: AppShell });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', beforeLoad: () => { throw redirect({ to: '/overview', replace: true }); } });
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/overview', component: NowScreen });
const captureRoute = createRoute({ getParentRoute: () => rootRoute, path: '/capture', component: CaptureScreen });
const notesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notes', component: NotesScreen });
const noteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/note/$id', component: lazyRouteComponent(() => import('../screens/NoteView'), 'NoteViewScreen') });
const planRoute = createRoute({ getParentRoute: () => rootRoute, path: '/plan', validateSearch: (search: Record<string, unknown>): { view?: string } => ({ view: typeof search.view === 'string' ? search.view : undefined }), component: PlanScreen });
const taskRoute = createRoute({ getParentRoute: () => rootRoute, path: '/task/$id', component: TaskLinkScreen });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsLinkScreen });

const routeTree = rootRoute.addChildren([indexRoute, overviewRoute, captureRoute, notesRoute, noteRoute, planRoute, taskRoute, settingsRoute]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, history: createHashHistory(), context: { queryClient } });
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof createAppRouter> }
}
