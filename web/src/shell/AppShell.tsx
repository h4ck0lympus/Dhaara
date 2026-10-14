import { Outlet, useRouter } from '@tanstack/react-router';
import { useEffect, type JSX } from 'react';
import { avatarLetter } from '../copy';
import { UnlockDialog } from '../dialogs/Unlock';
import { useConnected } from '../domain/connection';
import { RouteGuards } from '../routes/guards';
import { useSnapshot } from '../state/queries';
import { BackgroundField } from '../ui/BackgroundField';
import { Icon } from '../ui/Icon';
import { ToastHost } from '../ui/Toast';
import { openDialog } from './dialogs';
import { DialogHost } from './DialogHost';
import { installKeyboard } from './keyboard';
import { Nav } from './Nav';
import { NotificationCenter } from './NotificationCenter';
import { notificationsOptedIn, notifyAgentUpdates, notifyDueReminders } from './notifications';
import { StatusLine } from './StatusLine';
import { cancelUnlock, useUnlockOpen } from './unlock';

function UnlockHost(): JSX.Element | null {
  return useUnlockOpen() ? <UnlockDialog onClose={cancelUnlock} /> : null;
}

export function AppShell(): JSX.Element {
  const router = useRouter();
  const connected = useConnected();
  const snapshotQuery = useSnapshot();
  const snapshot = snapshotQuery.data;
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.hidden && notificationsOptedIn()) void snapshotQuery.refetch(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [snapshotQuery.refetch]);
  useEffect(() => installKeyboard(to => router.history.push(to)), [router]);
  useEffect(() => { if (connected && snapshot) { notifyDueReminders(snapshot); notifyAgentUpdates(snapshot); } }, [connected, snapshot]);
  const letter = avatarLetter(snapshot?.settings.display_name ?? '');
  return (
    <div className="app">
      <BackgroundField motion={snapshot?.settings.motion ?? true} />
      <Nav />
      <div className="workspace">
        <header className="topbar">
          <span className="workspace-label"><span className="desktop-wordmark">Your workspace</span><span className="mobile-wordmark">dhaara</span></span>
          <StatusLine />
          <button type="button" className="topbar-search quiet-button" onClick={() => { void router.navigate({ to: '/overview' }).then(() => window.dispatchEvent(new CustomEvent('dhaara-overview-pane', { detail: 'notes' }))); }}><Icon name="search" size={17} /><span>Search notes…</span></button>
          <NotificationCenter />
          <button type="button" className="profile-button" aria-label="Settings" onClick={() => openDialog({ kind: 'settings' })}>
            {letter && <span className="avatar" aria-hidden="true">{letter}</span>}
            <Icon name="settings" size={18} />
          </button>
        </header>
        <main className="content"><Outlet /></main>
      </div>
      <ToastHost />
      <DialogHost />
      <UnlockHost />
      <RouteGuards />
    </div>
  );
}
