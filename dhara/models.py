"""Bounded API inputs. A note is knowledge, never an implicit task."""
from datetime import date, datetime, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

Status = Literal['todo', 'active', 'waiting', 'blocked', 'review', 'parked', 'done']

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)

class TaskCreate(Input):
    title: str = Field(min_length=1, max_length=240)
    project: str = Field(default='Personal', min_length=1, max_length=80)
    detail: str = Field(default='', max_length=16000)
    next_action: str = Field(default='', max_length=1000)
    status: Status = 'todo'
    priority: Literal['auto', 'high', 'medium', 'low'] = 'auto'
    due_at: str | None = None
    not_before: str | None = None
    estimate_minutes: int | None = Field(default=None, ge=1, le=1440)
    dependencies: list[str] = Field(default_factory=list, max_length=30)
    session_url: str = Field(default='', max_length=2048)
    planned_on: date | None = None

    @field_validator('title', 'project')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Must not be blank')
        return value.strip()

    @field_validator('due_at', 'not_before')
    @classmethod
    def timestamp(cls, value):
        if value is None or value == '': return None
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if dt.tzinfo is None: raise ValueError('Include a timezone offset')
        return dt.astimezone(timezone.utc).isoformat()

    @field_validator('session_url')
    @classmethod
    def safe_url(cls, value):
        from urllib.parse import urlsplit
        if value and (urlsplit(value).scheme not in ('http', 'https') or not urlsplit(value).hostname):
            raise ValueError('Use an http or https link')
        return value

class TaskUpdate(TaskCreate):
    expected_version: int = Field(ge=1)

class TaskCaptureDetails(TaskCreate):
    title: str = Field(default='Captured task', min_length=1, max_length=240)

class TaskCapture(Input):
    capture_id: str = Field(min_length=8, max_length=80, pattern=r'^[a-zA-Z0-9_-]+$')
    raw: str = Field(min_length=1, max_length=16000)
    local_day: date
    details: TaskCaptureDetails | None = None

    @field_validator('raw')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('Write what you need to do')
        return value

class Capture(Input):
    capture_id: str = Field(min_length=8, max_length=80, pattern=r'^[a-zA-Z0-9_-]+$')
    raw: str = Field(default='', max_length=100000)
    project: str = Field(default='', max_length=80)
    task_id: str | None = None
    organize: bool = True

class NoteUpdate(Input):
    title: str = Field(min_length=1, max_length=240)
    folder: str = Field(min_length=1, max_length=240)
    body: str = Field(max_length=150000)
    expected_version: int = Field(ge=1)

class VersionInput(Input):
    expected_version: int = Field(ge=1)

class ReminderInput(Input):
    task_id: str
    at: str
    @field_validator('at')
    @classmethod
    def timestamp(cls, value):
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if dt.tzinfo is None: raise ValueError('Include a timezone offset')
        return dt.astimezone(timezone.utc).isoformat()

class Snooze(Input):
    minutes: int = Field(ge=1, le=43200)

class FocusInput(Input):
    task_id: str | None = None
    pinned: bool = True

class RunCreate(Input):
    task_id: str
    agent: str = Field(min_length=1, max_length=100)
    session_url: str = Field(default='', max_length=2048)
    run_id: str | None = Field(default=None, min_length=8, max_length=80, pattern=r'^[a-zA-Z0-9_-]+$')
    safe_url = field_validator('session_url')(TaskCreate.safe_url.__func__)

class RunEvent(Input):
    event_id: str = Field(min_length=8, max_length=80, pattern=r'^[a-zA-Z0-9_-]+$')
    seq: int = Field(ge=1, le=2147483647)
    kind: Literal['started', 'heartbeat', 'progress', 'needs_input', 'completed', 'failed', 'cancelled']
    message: str = Field(default='', max_length=4000)

class TokenInput(Input):
    name: str = Field(min_length=1, max_length=80)
    scope: Literal['agent', 'observer'] = 'agent'
    task_ids: list[str] = Field(default_factory=list, max_length=50)

class ContextInput(Input):
    device: str = Field(default='desktop', max_length=80)
    app: str = Field(default='', max_length=160)
    title: str = Field(default='', max_length=1000)
    workspace: str = Field(default='', max_length=80)
    monitor: str = Field(default='', max_length=80)

class RuleInput(Input):
    app: str = Field(default='', max_length=160)
    contains: str = Field(default='', max_length=200)
    task_id: str

class SettingsInput(Input):
    observation_enabled: bool | None = None
    motion: bool | None = None
    companion: Literal['cat', 'dot', 'hidden'] | None = None
    companion_size: int | None = Field(default=None, ge=24, le=72)
    display_name: str | None = Field(default=None, max_length=60)
    theme: Literal['dark', 'light', 'system'] | None = None

    @field_validator('display_name', mode='before')
    @classmethod
    def strip_display_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class AgentConnectionInput(Input):
    enabled: bool
    mode: Literal['hooks', 'plugin'] = 'hooks'
