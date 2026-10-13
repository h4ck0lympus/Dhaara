#!/usr/bin/env python3
"""Read-only diagnostics. No downloads, screen capture or model loading."""
import importlib.util
import os
import platform
import shutil
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # tools/ scripts run from anywhere; dhara/ is beside them
from dhara.env import env
print('Noema diagnostics')
print('Python:',sys.version.split()[0], '| OS:',platform.system(),platform.release())
for name in ('fastapi','uvicorn','httpx','multipart','faster_whisper','gi'):
    print(f'{name}:', 'installed' if importlib.util.find_spec(name) else 'not installed')
for command in ('swaymsg','ollama'):
    print(f'{command}:',shutil.which(command) or 'not on PATH')
print('Sway session:',bool(os.getenv('SWAYSOCK')))
print('Organizer configured:',bool(env('MODEL')))
print('Speech configured:',bool(env('SPEECH_MODEL')))
print('No active model or desktop capability was exercised.')
