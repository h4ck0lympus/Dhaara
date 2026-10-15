import { Link, Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, type JSX } from 'react';
import { UnlockDialog } from '../dialogs/Unlock';
import { useConnected } from '../domain/connection';
import { RouteGuards } from '../routes/guards';
import { SEARCH_MAX_LENGTH } from '../screens/notesList';
import { useSnapshot } from '../state/queries';
import { Icon } from '../ui/Icon';
import { ToastHost } from '../ui/Toast';
import { DialogHost } from './DialogHost';
import { installKeyboard } from './keyboard';
import { Nav } from './Nav';
import { NotificationCenter } from './NotificationCenter';
import { notificationsOptedIn, notifyAgentUpdates, notifyDueReminders } from './notifications';
import { StatusLine } from './StatusLine';
import { useAppliedTheme } from './theme';
import { cancelUnlock, useUnlockOpen } from './unlock';

function UnlockHost(): JSX.Element | null {
  return useUnlockOpen() ? <UnlockDialog onClose={cancelUnlock} /> : null;
}

function SiteSearch(): JSX.Element {
  const navigate = useNavigate();
  const { pathname, q } = useRouterState({ select: state => ({ pathname: state.location.pathname, q: (state.location.search as { q?: unknown }).q }) });
  const value = pathname === '/notes' && typeof q === 'string' ? q : '';
  return (
    <form className="site-search" role="search" onSubmit={event => event.preventDefault()}>
      <label htmlFor="site-search" className="sr-only">Search notes</label>
      <Icon name="search" size={16} />
      <input id="site-search" type="search" autoComplete="off" maxLength={SEARCH_MAX_LENGTH} placeholder="Search notes…  /" value={value}
        onChange={event => { const q = event.target.value || undefined; void navigate({ to: '/notes', search: (prev: Record<string, unknown>) => (pathname === '/notes' ? { ...prev, q } : { q }), replace: pathname === '/notes' }); }} />
    </form>
  );
}

export function AppShell(): JSX.Element {
  const router = useRouter();
  const connected = useConnected();
  const snapshotQuery = useSnapshot();
  const snapshot = snapshotQuery.data;
  useAppliedTheme(snapshot?.settings.theme ?? 'dark');
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.hidden && notificationsOptedIn()) void snapshotQuery.refetch(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [snapshotQuery.refetch]);
  useEffect(() => installKeyboard(to => router.history.push(to)), [router]);
  useEffect(() => { if (connected && snapshot) { notifyDueReminders(snapshot); notifyAgentUpdates(snapshot); } }, [connected, snapshot]);
  return (
    <div className="app">
      <header className="topbar">
        <Nav />
        <StatusLine />
        <SiteSearch />
        <NotificationCenter />
      </header>
      <main className="content"><Outlet /></main>
      <Link to="/settings" className="settings-link" aria-label="Settings" title="Settings"><Icon name="settings" /></Link>
      <ToastHost />
      <DialogHost />
      <UnlockHost />
      <RouteGuards />
    </div>
  );
}
