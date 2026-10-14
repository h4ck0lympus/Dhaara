"""Generate a self-contained, machine-local plugin for either agent host."""
import json
import os
from pathlib import Path
import shlex
import shutil

from .agent_hook import EVENTS

SKILL = '''---
name: dhaara
description: Explain or troubleshoot dhaara's automatic local agent status integration when the user asks about dhaara tracking. Lifecycle hooks report status independently of this skill.
---

# dhaara agent connection

The installed lifecycle hooks register this session automatically. Do not ask
the user for a task ID, token, or wrapper command. Do not duplicate hook events
by calling the old agent API, and do not enable screen observation.

The hook sends only session status and the project folder name to a private
local queue. It does not read transcripts or send prompts, tool content, or
assistant responses. A Stop event means a turn is ready for human review;
it does not verify correctness or complete the user's task.

If updates are missing, open dhaara Settings → Connect your agents. Check the
last received update. Claude Code loads changed hooks in a new session; Codex
requires review of the exact hook definition in /hooks. Never bypass that
review. Disabled hooks, a missing runtime, or a full/unwritable local queue
can prevent reporting. Stale reports must remain unknown, not working.

This plugin is tied to the local dhaara workspace selected when connected.
Do not install both the plugin and the direct hooks on the same host. The
app's Disconnect button stops ingestion even if this plugin remains enabled.
'''


def build_plugin(folder, provider, inbox, python):
    """No credentials or repository imports; plugins can outlive source moves."""
    folder = Path(folder)
    (folder / 'hooks').mkdir(parents=True, exist_ok=True, mode=0o700)
    (folder / 'skills' / 'dhaara').mkdir(parents=True, exist_ok=True)
    manifest_dir = folder / ('.claude-plugin' if provider == 'claude' else '.codex-plugin')
    manifest_dir.mkdir(exist_ok=True)
    manifest = {'name': 'dhaara', 'version': '0.1.0', 'description': 'Automatic local work status for dhaara.'}
    if provider == 'codex':
        manifest.update({'hooks': './hooks/hooks.json', 'skills': './skills/'})
    (manifest_dir / 'plugin.json').write_text(json.dumps(manifest, indent=2) + '\n')
    shutil.copyfile(Path(__file__).with_name('agent_hook.py'), folder / 'hooks' / 'report.py')
    (folder / 'skills' / 'dhaara' / 'SKILL.md').write_text(SKILL)
    variable = 'CLAUDE_PLUGIN_ROOT' if provider == 'claude' else 'PLUGIN_ROOT'
    # Plugin root is supplied by the host; the queue belongs to this installation.
    if os.name == 'nt':
        command = f'"{python}" "%{variable}%/hooks/report.py" --inbox "{inbox}" --provider {provider}'
    else:
        command = f'{shlex.quote(python)} "${{{variable}}}/hooks/report.py" --inbox {shlex.quote(str(inbox))} --provider {provider}'
    events = [e for e in EVENTS if not (provider == 'claude' and e == 'Interrupt')
              and not (provider == 'codex' and e == 'StopFailure')]
    config = {'hooks': {event: [{'hooks': [{'type': 'command', 'command': command, 'timeout': 2}]}] for event in events}}
    (folder / 'hooks' / 'hooks.json').write_text(json.dumps(config, indent=2) + '\n')
    return folder
