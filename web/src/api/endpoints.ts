export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Replay = 'read' | 'idempotent-by-key' | 'once-per-action';
export type EndpointSpec = { readonly method: Method; readonly path: `/${string}`; readonly replay: Replay };

export const ENDPOINTS = {
  state: { method: 'GET', path: '/state', replay: 'read' },
  task: { method: 'GET', path: '/tasks/:id', replay: 'read' },
  search: { method: 'GET', path: '/search', replay: 'read' },
  note: { method: 'GET', path: '/notes/:id', replay: 'read' },
  noteHistory: { method: 'GET', path: '/notes/:id/history', replay: 'read' },
  tokens: { method: 'GET', path: '/tokens', replay: 'read' },
  capture: { method: 'POST', path: '/captures', replay: 'idempotent-by-key' },
  taskCapture: { method: 'POST', path: '/task-captures', replay: 'idempotent-by-key' },
  focus: { method: 'POST', path: '/focus', replay: 'once-per-action' },
  taskUpdate: { method: 'PUT', path: '/tasks/:id', replay: 'once-per-action' },
  taskOrder: { method: 'PUT', path: '/task-order', replay: 'once-per-action' },
  noteUpdate: { method: 'PUT', path: '/notes/:id', replay: 'once-per-action' },
  noteRestore: { method: 'POST', path: '/notes/:id/restore/:version', replay: 'once-per-action' },
  noteApplySuggestion: { method: 'POST', path: '/notes/:id/suggestions/:sid/apply', replay: 'once-per-action' },
  noteOrganize: { method: 'POST', path: '/notes/:id/organize', replay: 'once-per-action' },
  noteTranscribe: { method: 'POST', path: '/notes/:id/transcribe', replay: 'once-per-action' },
  reminderCreate: { method: 'POST', path: '/reminders', replay: 'once-per-action' },
  reminderSnooze: { method: 'POST', path: '/reminders/:id/snooze', replay: 'once-per-action' },
  reminderDismiss: { method: 'DELETE', path: '/reminders/:id', replay: 'once-per-action' },
  runEndTracking: { method: 'POST', path: '/runs/:id/end-tracking', replay: 'once-per-action' },
  settingsUpdate: { method: 'PATCH', path: '/settings', replay: 'once-per-action' },
  ruleCreate: { method: 'POST', path: '/context/rules', replay: 'once-per-action' },
  ruleDelete: { method: 'DELETE', path: '/context/rules/:id', replay: 'once-per-action' },
  tokenCreate: { method: 'POST', path: '/tokens', replay: 'once-per-action' },
  tokenRevoke: { method: 'DELETE', path: '/tokens/:id', replay: 'once-per-action' },
  sessionCreate: { method: 'POST', path: '/session', replay: 'once-per-action' },
  sessionDelete: { method: 'DELETE', path: '/session', replay: 'once-per-action' },
} as const satisfies Record<string, EndpointSpec>;

export type EndpointKey = keyof typeof ENDPOINTS;

export function endpointPath(
  key: EndpointKey,
  params: Record<string, string | number> = {},
  query: Record<string, string | number | undefined> = {},
): `/${string}` {
  const path = ENDPOINTS[key].path.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path parameter ${name}`);
    return encodeURIComponent(String(value));
  });
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (value !== undefined) search.set(name, String(value));
  const text = search.toString();
  return (text ? `${path}?${text}` : path) as `/${string}`;
}
