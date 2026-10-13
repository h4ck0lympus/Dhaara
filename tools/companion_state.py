"""Pure, conservative presentation for the native Sway companion."""


def observation_status(summary, connected=True):
    if not connected:
        return 'Server unavailable · observation not confirmed'
    if not summary.get('settings', {}).get('observation_enabled'):
        return 'Observation paused'
    context = summary.get('context') or {}
    if context and not context.get('stale', True):
        return 'Recent window metadata report'
    return 'Allowed · no recent observer report'


def visual_settings(settings, local_mode=None, local_size=None):
    # A server-side privacy/visibility choice takes precedence over local Cat/Dot.
    mode = 'hidden' if settings.get('companion') == 'hidden' else (
        local_mode or settings.get('companion', 'cat'))
    if mode not in ('cat', 'dot', 'hidden'):
        mode = 'cat'
    try:
        size = int(local_size if local_size is not None else settings.get('companion_size', 40))
    except (TypeError, ValueError):
        size = 40
    return mode, max(24, min(72, size))


def workspace_placement(context, workspaces):
    if not context or context.get('stale', True):
        return None
    target = next((w for w in workspaces if w['name'] == context.get('workspace')
                   and w['output'] == context.get('monitor')), None)
    return {'visible': bool(target and target['visible']),
            'rect': target.get('rect') if target else None}
