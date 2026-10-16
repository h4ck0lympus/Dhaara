"""Optional OpenRouter client for Dhara's AI features. Off unless the user adds a key and opts in.

Everything sent here leaves the computer, so callers check `Settings.ai_enabled` first and
treat every reply as untrusted: JSON is validated against the caller's schema before use.
"""
from __future__ import annotations

import base64
import json
import os
import re
import time
from pathlib import Path

import httpx

from .env import env

OPENROUTER = 'https://openrouter.ai/api/v1'
MODELS_DEV = 'https://models.dev/api.json'
DEFAULT_TEXT_MODEL = 'openrouter/free'
DEFAULT_AUDIO_MODEL = 'thinkingmachines/inkling-small:free'
KEY_FILE = 'openrouter.key'
CATALOG_TTL = 24 * 3600
_catalog: dict = {'at': 0.0, 'models': []}


class AIError(ValueError):
    """A user-presentable failure; the caller's original data is always kept."""


def read_key(root: Path) -> str:
    """An env key wins so headless installs need no file; otherwise the 0600 key file."""
    from_env = (env('OPENROUTER_API_KEY') or '').strip()
    if from_env:
        return from_env
    path = Path(root) / KEY_FILE
    return path.read_text().strip() if path.is_file() else ''


def write_key(root: Path, key: str) -> None:
    key = key.strip()
    if not re.fullmatch(r'[A-Za-z0-9_\-.:]{16,200}', key):
        raise AIError('That does not look like an OpenRouter key.')
    path = Path(root) / KEY_FILE
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as handle:
        handle.write(key)
    path.chmod(0o600)


def delete_key(root: Path) -> None:
    (Path(root) / KEY_FILE).unlink(missing_ok=True)


def key_hint(key: str) -> str:
    return f'…{key[-4:]}' if key else ''


def first_json_object(text: str) -> dict:
    """Models without strict JSON mode wrap answers in prose or code fences; take the first object."""
    text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip())
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find('{'), text.rfind('}')
        if start < 0 or end <= start:
            raise AIError('The model did not return JSON.')
        try:
            value = json.loads(text[start:end + 1])
        except json.JSONDecodeError as error:
            raise AIError('The model did not return valid JSON.') from error
    if not isinstance(value, dict):
        raise AIError('The model did not return a JSON object.')
    return value


class OpenRouter:
    def __init__(self, key: str, model: str = DEFAULT_TEXT_MODEL, audio_model: str = DEFAULT_AUDIO_MODEL, transport: httpx.BaseTransport | None = None):
        if not key:
            raise AIError('Add an OpenRouter key in Settings to use AI features.')
        self.key, self.model, self.audio_model, self.transport = key, model or DEFAULT_TEXT_MODEL, audio_model or DEFAULT_AUDIO_MODEL, transport

    def _post(self, body: dict) -> str:
        headers = {'Authorization': f'Bearer {self.key}', 'X-Title': 'Dhara', 'HTTP-Referer': 'https://github.com/dhara-app'}
        try:
            with httpx.Client(base_url=OPENROUTER, timeout=httpx.Timeout(120, connect=10), transport=self.transport, trust_env=False) as client:
                response = client.post('/chat/completions', json=body, headers=headers)
        except httpx.HTTPError as error:
            raise AIError('Could not reach OpenRouter. Check your connection; nothing was changed.') from error
        if response.status_code == 401:
            raise AIError('OpenRouter rejected the key. Update it in Settings.')
        if response.status_code == 429:
            raise AIError('OpenRouter free-tier limit reached. It will retry later; nothing was changed.')
        if response.status_code >= 400:
            raise AIError(f'OpenRouter returned an error ({response.status_code}); nothing was changed.')
        try:
            return response.json()['choices'][0]['message']['content'] or ''
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise AIError('OpenRouter sent an unexpected reply; nothing was changed.') from error

    def json(self, system: str, payload: dict, schema: dict, name: str) -> dict:
        """Ask for an object matching `schema`. Strict JSON mode first; plain JSON prompting if the model refuses it."""
        messages = [{'role': 'system', 'content': system},
                    {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}]
        body = {'model': self.model, 'messages': messages, 'temperature': 0.1,
                'response_format': {'type': 'json_schema', 'json_schema': {'name': name, 'strict': True, 'schema': schema}}}
        try:
            return first_json_object(self._post(body))
        except AIError as error:
            if 'error (400)' not in str(error):
                raise
        body.pop('response_format')
        body['messages'][0] = {'role': 'system', 'content': system + '\nReply with one JSON object matching this schema and nothing else:\n' + json.dumps(schema)}
        return first_json_object(self._post(body))

    def transcribe(self, audio: bytes, fmt: str = 'wav') -> str:
        if fmt not in ('wav', 'mp3'):
            raise AIError('Dictation needs WAV or MP3 audio.')
        body = {'model': self.audio_model, 'temperature': 0, 'messages': [
            {'role': 'system', 'content': 'Transcribe the speech verbatim. Return only the words spoken, with punctuation. If there is no speech, return an empty string.'},
            {'role': 'user', 'content': [{'type': 'input_audio', 'input_audio': {'data': base64.b64encode(audio).decode(), 'format': fmt}}]}]}
        return self._post(body).strip()


def free_models(get=None, clock=time.time) -> list[dict]:
    """Free OpenRouter models from models.dev, cached for a day. Fetched only when Settings asks."""
    if _catalog['models'] and clock() - _catalog['at'] < CATALOG_TTL:
        return _catalog['models']
    get = get or (lambda url: httpx.get(url, timeout=15, trust_env=False))
    try:
        response = get(MODELS_DEV)
        response.raise_for_status()
        provider = response.json().get('openrouter') or {}
    except (httpx.HTTPError, ValueError, AttributeError) as error:
        if _catalog['models']:
            return _catalog['models']
        raise AIError('Could not load the model list from models.dev.') from error
    models = []
    for model_id, model in (provider.get('models') or {}).items():
        cost = model.get('cost') or {}
        if cost.get('input', 1) != 0 or cost.get('output', 1) != 0:
            continue
        inputs = (model.get('modalities') or {}).get('input') or []
        if 'text' not in inputs:
            continue
        models.append({'id': model_id, 'name': str(model.get('name') or model_id)[:120],
                       'context': int((model.get('limit') or {}).get('context') or 0),
                       'structured': bool(model.get('structured_output')), 'audio': 'audio' in inputs})
    models.sort(key=lambda m: (not m['structured'], m['name'].lower()))
    _catalog.update(at=clock(), models=models)
    return models
