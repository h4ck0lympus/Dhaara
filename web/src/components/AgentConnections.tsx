import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { z } from '../zod';

const Connections = z.object({ connections: z.array(z.object({
  provider: z.enum(['claude', 'codex']), name: z.string(), installed: z.boolean(), last_seen: z.string().nullable(),
  mode: z.enum(['hooks', 'plugin']).default('hooks'),
})) });

export function useAgentConnections() {
  return useQuery({ queryKey: ['agent-connections'], queryFn: () => api('/agent-connections', Connections), refetchInterval: 5000 });
}

export function AgentConnections() {
  const client = useQueryClient();
  const query = useAgentConnections();
  const change = useMutation({
    mutationFn: ({ provider, enabled, mode }: { provider: string; enabled: boolean; mode?: 'hooks' | 'plugin' }) =>
      api(`/agent-connections/${provider}`, Connections, { method: 'POST', body: { enabled, ...(mode ? { mode } : {}) } }),
    onSuccess: data => { client.setQueryData(['agent-connections'], data); },
  });
  return <section className="settings-section" aria-label="Connect your agents">
    <h2 className="subheading">Connect your agents</h2>
    <p className="subtle-line">Connect once on this computer. Sessions appear automatically, with updates when an agent works, needs input, or has a result to review.</p>
    <p className="subtle-line">Shares status and the project folder name locally. Prompts, transcripts, files, and screen content stay out. Connecting adds dhaara hooks to your agent settings.</p>
    {query.isPending && <p className="subtle-line">Checking connections…</p>}
    {(query.data?.connections ?? []).map(connection => <div className="setting-row" key={connection.provider}>
      <div className="setting-label">{connection.name}<p>{connection.installed
        ? connection.last_seen ? 'Updates received' : connection.mode === 'plugin' ? 'Plugin prepared · install it in your agent' : 'Hooks installed · waiting for the first update'
        : 'Not connected'}</p>
        {connection.installed && <p>{connection.provider === 'codex'
          ? 'Open /hooks in Codex and trust the dhaara hooks once.'
          : 'Start a new Claude Code session to load the hooks.'}</p>}
        {connection.installed && <details><summary>Plugin package</summary>
          {connection.mode === 'hooks' ? <><p>Switching removes the direct hooks and prepares a plugin you can install in your agent.</p>
            <button type="button" className="quiet-button" disabled={change.isPending}
              onClick={() => change.mutate({ provider: connection.provider, enabled: true, mode: 'plugin' })}>Use plugin instead</button></>
            : <><a href={`/api/agent-connections/${connection.provider}/plugin`}>Download local plugin</a>
              <p>Install the extracted folder in your agent. Remove or disable that plugin before switching back to direct hooks.</p></>}
        </details>}
      </div>
      <button className="secondary" type="button" disabled={change.isPending}
        onClick={() => change.mutate({ provider: connection.provider, enabled: !connection.installed })}>
        {connection.installed ? 'Disconnect' : 'Connect'} {connection.name}
      </button>
    </div>)}
    {(query.error || change.error) && <p role="alert" className="field-error">{(change.error || query.error)?.message}</p>}
  </section>;
}
