// web/src/dialogs/Unlock.tsx
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type JSX } from 'react';
import { unlock } from '../api/session';
import { completeUnlock } from '../shell/unlock';
import { S } from '../strings';
import { Dialog } from '../ui/Dialog';
import { messageOf } from '../ui/Toast';

export function UnlockDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const token = String(new FormData(event.currentTarget).get('token') ?? '');
    setBusy(true);
    setError('');
    try {
      await unlock(token);
      await completeUnlock(qc); // closes this dialog
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title={S.unlockTitle} onRequestClose={onClose}>
      <p className="small dim">{S.unlockHelp}</p>
      <form onSubmit={submit}>
        <label className="field">{S.accessToken}
          <input type="password" name="token" autoComplete="current-password" required data-autofocus="" />
        </label>
        <p className="field-error" role="alert">{error}</p>
        <div className="dialog-actions"><button className="primary" type="submit" disabled={busy}>{S.unlock}</button></div>
      </form>
    </Dialog>
  );
}
