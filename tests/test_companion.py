"""Native helper policy tests; GI/device-independent, explicit fixtures/doubles."""
from pathlib import Path
import sys
import threading
import hashlib

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from companion_state import observation_status, visual_settings, workspace_placement
from sway_companion import Companion


def test_approved_kitten_asset_is_unmodified():
    sprite = Path(__file__).resolve().parents[1] / 'tools/assets/cat.png'
    assert hashlib.sha256(sprite.read_bytes()).hexdigest() == (
        'bc81d2ce788db7c6cd6cf5971b61450a9949c571cbaebe64b65d49d481ab3d0f')


@pytest.mark.parametrize('summary,connected,expected', [
    ({'settings': {'observation_enabled': False}}, True, 'Observation paused'),
    ({'settings': {'observation_enabled': True}}, True, 'Allowed · no recent observer report'),
    ({'settings': {'observation_enabled': True}, 'context': {'stale': True}}, True,
     'Allowed · no recent observer report'),
    ({'settings': {'observation_enabled': True}, 'context': {'workspace': '1'}}, True,
     'Allowed · no recent observer report'),
    ({'settings': {'observation_enabled': True}, 'context': {'stale': False}}, True,
     'Recent window metadata report'),
    ({'settings': {'observation_enabled': True}, 'context': {'stale': False}}, False,
     'Server unavailable · observation not confirmed'),
])
def test_truthful_observation(summary, connected, expected):
    assert observation_status(summary, connected) == expected


@pytest.mark.parametrize('settings,mode,size,expected', [
    ({}, None, None, ('cat', 40)),
    ({'companion': 'dot', 'companion_size': 24}, None, None, ('dot', 24)),
    ({'companion': 'cat', 'companion_size': 72}, None, None, ('cat', 40)),
    ({'companion': 'hidden'}, 'dot', None, ('hidden', 40)),
    ({'companion': 'cat'}, 'hidden', None, ('hidden', 40)),
    ({'companion': 'dot'}, 'cat', 32, ('cat', 32)),
    ({'companion_size': 'bad'}, None, None, ('cat', 40)),
    ({'companion_size': 0}, 'bad', None, ('cat', 24)),
])
def test_tiny_and_hidden_policy(settings, mode, size, expected):
    assert visual_settings(settings, mode, size) == expected


def test_placement_matches_output_and_workspace():
    context = {'stale': False, 'workspace': '2', 'monitor': 'HEADLESS-2'}
    workspaces = [
        {'name': '2', 'output': 'HEADLESS-1', 'visible': True, 'rect': {'x': 0}},
        {'name': '2', 'output': 'HEADLESS-2', 'visible': False, 'rect': {'x': 1440}},
    ]
    assert workspace_placement(context, workspaces) == {'visible': False, 'rect': {'x': 1440}}
    assert workspace_placement({**context, 'stale': True}, workspaces) is None
    assert workspace_placement(context, []) == {'visible': False, 'rect': None}


@pytest.mark.parametrize('enabled,paused,expected', [(False, False, 0), (True, True, 0),
                                                   (True, False, 1)])
def test_local_pause_and_launch_opt_in_gate_polling(monkeypatch, enabled, paused, expected):
    import sway_companion
    def no_workspaces(_):
        raise AssertionError('No workspace read without recent context')
    monkeypatch.setattr(sway_companion, 'sway_json', no_workspaces)
    class ClientDouble:
        def request(self, path):
            assert path == '/companion'
            return {'settings': {'observation_enabled': True}, 'context': None}
    class LoopDouble:
        @staticmethod
        def idle_add(*args):
            pass
    class ObserverDouble:
        calls = 0
        def step(self, summary):
            self.calls += 1
    app = Companion.__new__(Companion)
    app.client, app.GLib, app.apply = ClientDouble(), LoopDouble(), lambda *_: None
    app.observe_window_context = enabled
    app.observation_paused = threading.Event()
    if paused:
        app.observation_paused.set()
    observer = ObserverDouble()
    app.poll_once(observer)
    assert observer.calls == expected
