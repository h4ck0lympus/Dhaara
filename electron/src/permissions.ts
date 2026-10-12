import type { Session } from 'electron';
import { sameOrigin } from './origin.js';

export type PermissionKind = 'media-audio' | 'notifications';

// Wording from desktop/src/main.rs:263-276.
export const PERMISSION_PROMPTS: Record<PermissionKind, string> = {
  'media-audio': 'Allow Noema to use your microphone for a recording?',
  notifications: 'Allow Noema to show notifications?',
};

export function classifyPermission(
  permission: string,
  details: { mediaTypes?: string[]; isMainFrame: boolean; requestingUrl: string },
  origin: string,
): PermissionKind | null {
  if (!details.isMainFrame || !sameOrigin(origin, details.requestingUrl)) return null;
  if (permission === 'media') {
    const types = details.mediaTypes ?? [];
    return types.length === 1 && types[0] === 'audio' ? 'media-audio' : null;
  }
  return permission === 'notifications' ? 'notifications' : null;
}

/** Decisions live in memory for this app session only; a restart prompts again (spec §6.3, §10). */
export function installPermissions(session: Session, origin: string, prompt: (kind: PermissionKind) => Promise<boolean>): void {
  const decisions = new Map<PermissionKind, boolean>();
  const pending = new Map<PermissionKind, Promise<boolean>>();
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes as string[] | undefined) : undefined;
    const kind = classifyPermission(permission, { mediaTypes, isMainFrame: details.isMainFrame, requestingUrl: details.requestingUrl }, origin);
    if (kind === null) return callback(false);
    const known = decisions.get(kind);
    if (known !== undefined) return callback(known);
    let answer = pending.get(kind);
    if (!answer) {
      answer = prompt(kind).catch(() => false).then((granted) => {
        decisions.set(kind, granted);
        pending.delete(kind);
        return granted;
      });
      pending.set(kind, answer);
    }
    void answer.then(callback);
  });
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
    const kind = classifyPermission(permission, {
      mediaTypes: details.mediaType ? [details.mediaType] : undefined,
      isMainFrame: details.isMainFrame,
      requestingUrl: details.requestingUrl ?? details.securityOrigin ?? requestingOrigin,
    }, origin);
    return kind !== null && decisions.get(kind) === true;
  });
}
