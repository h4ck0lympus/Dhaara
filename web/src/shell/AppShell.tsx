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
import { notifyDueReminders } from './notifications';
import { StatusLine } from './StatusLine';
import { cancelUnlock, useUnlockOpen } from './unlock';

function UnlockHost(): JSX.Element | null {
  return useUnlockOpen() ? <UnlockDialog onClose={cancelUnlock} /> : null;
}

export function AppShell(): JSX.Element {
  const router = useRouter();
  const connected = useConnected();
  const snapshot = useSnapshot().data;
  useEffect(() => installKeyboard(to => router.history.push(to)), [router]);
  useEffect(() => { if (connected && snapshot) notifyDueReminders(snapshot); }, [connected, snapshot]);
  const letter = avatarLetter(snapshot?.settings.display_name ?? '');
  return (
    <div className="app">
      <BackgroundField motion={snapshot?.settings.motion ?? false} />
      <Nav />
      <div className="workspace">
        <header className="topbar">
          <span className="workspace-label"><span className="desktop-wordmark">Your workspace</span><span className="mobile-wordmark">Noema</span></span>
          <StatusLine />
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
