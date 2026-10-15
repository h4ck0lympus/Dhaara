import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { z } from '../zod';

const Connections = z.object({ connections: z.array(z.object({
  provider: z.enum(['claude', 'codex']), name: z.string(), installed: z.boolean(), last_seen: z.string().nullable(),
})) });

export function AgentConnections() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['agent-connections'], queryFn: () => api('/agent-connections', Connections), refetchInterval: 5000 });
  const change = useMutation({
    mutationFn: ({ provider, enabled }: { provider: string; enabled: boolean }) =>
      api(`/agent-connections/${provider}`, Connections, { method: 'POST', body: { enabled } }),
    onSuccess: data => { client.setQueryData(['agent-connections'], data); },
  });
  return <>
    {(query.data?.connections ?? []).map(connection => <div className="settings-row" key={connection.provider}>
      {connection.name}
      {connection.installed
        ? <div className="inline-actions"><span className="pill">{connection.last_seen ? 'Connected' : 'Waiting'}</span>
          {!connection.last_seen && <span className="small muted">{connection.provider === 'codex' ? 'Open /hooks in Codex and trust the dhaara hooks' : 'Start a new Claude Code session'}</span>}
          <button type="button" className="quiet-button" aria-label={`Disconnect ${connection.name}`} disabled={change.isPending}
            onClick={() => change.mutate({ provider: connection.provider, enabled: false })}>Disconnect</button></div>
        : <button type="button" className="secondary" aria-label={`Connect ${connection.name}`} disabled={change.isPending}
          onClick={() => change.mutate({ provider: connection.provider, enabled: true })}>Connect</button>}
    </div>)}
    {(query.error || change.error) && <p role="alert" className="field-error">{(change.error || query.error)?.message}</p>}
  </>;
}
