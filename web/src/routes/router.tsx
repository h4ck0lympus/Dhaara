import type { QueryClient } from '@tanstack/react-query';
import { createHashHistory, createRootRouteWithContext, createRoute, createRouter, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, type JSX } from 'react';
import type { Snapshot } from '../api/schemas';
import { CaptureScreen } from '../screens/Capture';
import { NotesScreen, type NotesSearch } from '../screens/Notes';
import { SEARCH_MAX_LENGTH } from '../screens/notesList';
import { NowScreen } from '../screens/Now';
import { PlanScreen } from '../screens/Plan';
import { SettingsScreen } from '../screens/Settings';
import { RootLayout } from '../shell/AppShell';
import { CompanionScreen } from '../screens/Companion';
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

const text = (value: unknown, max: number): string | undefined => (typeof value === 'string' && value ? value.slice(0, max) : undefined);
export const notesSearch = (search: Record<string, unknown>): NotesSearch => ({ q: text(search.q, SEARCH_MAX_LENGTH), folder: text(search.folder, 200), note: text(search.note, 200) });

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: RootLayout });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', beforeLoad: () => { throw redirect({ to: '/overview', replace: true }); } });
const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/overview', component: NowScreen });
const captureRoute = createRoute({ getParentRoute: () => rootRoute, path: '/capture', component: CaptureScreen });
const notesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notes', validateSearch: notesSearch, component: NotesScreen });
const noteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/note/$id', beforeLoad: ({ params }) => { throw redirect({ to: '/notes', search: { note: params.id }, replace: true }); } });
const planRoute = createRoute({ getParentRoute: () => rootRoute, path: '/plan', component: PlanScreen });
const taskRoute = createRoute({ getParentRoute: () => rootRoute, path: '/task/$id', component: TaskLinkScreen });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsScreen });

const companionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/companion', component: CompanionScreen });

const routeTree = rootRoute.addChildren([companionRoute, indexRoute, overviewRoute, captureRoute, notesRoute, noteRoute, planRoute, taskRoute, settingsRoute]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, history: createHashHistory(), context: { queryClient } });
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof createAppRouter> }
}
