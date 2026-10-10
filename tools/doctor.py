#!/usr/bin/env python3
"""Read-only diagnostics. No downloads, screen capture or model loading."""
import importlib.util
import os
import platform
import shutil
import sys
print('Noema diagnostics')
print('Python:',sys.version.split()[0], '| OS:',platform.system(),platform.release())
for name in ('fastapi','uvicorn','httpx','multipart','faster_whisper','gi'):
    print(f'{name}:', 'installed' if importlib.util.find_spec(name) else 'not installed')
for command in ('swaymsg','ollama'):
    print(f'{command}:',shutil.which(command) or 'not on PATH')
print('Sway session:',bool(os.getenv('SWAYSOCK')))
print('Organizer configured:',bool(os.getenv('NOEMA_MODEL')))
print('Speech configured:',bool(os.getenv('NOEMA_SPEECH_MODEL')))
print('No active model or desktop capability was exercised.')
