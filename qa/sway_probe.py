"""Native GTK probe child; only run through sway_check.py's private compositor."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('GtkLayerShell', '0.1')
from gi.repository import Gtk, GLib, GtkLayerShell


def widgets(widget):
    yield widget
    if isinstance(widget, Gtk.Container):
        for child in widget.get_children():
            yield from widgets(child)


def main():
    runtime = Path(os.environ['NOEMA_QA_PRIVATE_RUNTIME']).resolve()
    socket_path = Path(os.environ['SWAYSOCK']).resolve()
    compositor_pid = os.environ['NOEMA_QA_COMPOSITOR_PID']
    if (not runtime.parent.name.startswith('noema-sway-qa-') or socket_path.parent != runtime
            or not socket_path.name.endswith('.' + compositor_pid + '.sock')
            or Path(os.environ['XDG_RUNTIME_DIR']).resolve() != runtime):
        raise SystemExit('Refusing to probe or screenshot a non-fixture compositor')
    output = Path(os.environ['NOEMA_QA_OUTPUT'])
    phase = os.environ['NOEMA_QA_PHASE']
    source = Path(os.environ.get('NOEMA_QA_SOURCE', ROOT / 'tools/sway_companion.py'))
    spec = importlib.util.spec_from_file_location('companion_under_test', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # A saved baseline still uses the unchanged repository sprite asset.
    module.__file__ = str(ROOT / 'tools/sway_companion.py')
    checks = []
    popovers = []
    completed = False
    app = None
    # Record real GTK-created popovers for inspection; no mock widgets or API.
    make_popover = Gtk.Popover.new
    def record_popover(button):
        pop = make_popover(button)
        popovers.append(pop)
        return pop
    Gtk.Popover.new = record_popover
    started = time.monotonic()
    def check(ok, label):
        if not ok:
            raise AssertionError(label)
        checks.append(label)
    def screenshot(name):
        subprocess.run(['grim', '-o', 'HEADLESS-1', str(output / (name + '.png'))],
                       check=True, timeout=5)
    def later(callback, milliseconds=300):
        def guarded():
            try:
                callback()
            except Exception:
                traceback.print_exc()
                Gtk.main_quit()
            return False
        GLib.timeout_add(milliseconds, guarded)
    def inspect():
        try:
            window = next((w for w in Gtk.Window.list_toplevels()
                           if w.get_title() == 'Noema companion'), None)
            if window is None or not window.get_visible() or time.monotonic() - started < 2:
                return True
            button = window.get_child()
            check(GtkLayerShell.is_layer_window(window), 'Actual GTK companion uses layer shell')
            check(GtkLayerShell.get_exclusive_zone(window) == 0, 'Companion reserves no desktop layout space')
            check(GtkLayerShell.get_keyboard_mode(window) == GtkLayerShell.KeyboardMode.NONE,
                  'Idle companion does not request keyboard focus')
            button.clicked()
            GLib.timeout_add(800, inspect_popover, window)
            return False
        except Exception:
            traceback.print_exc()
            Gtk.main_quit()
            return False
    def inspect_popover(window):
        nonlocal completed
        try:
            pop = popovers[-1]
            labels = [w.get_text() for w in widgets(pop) if isinstance(w, Gtk.Label)]
            buttons = [w.get_label() for w in widgets(pop) if isinstance(w, Gtk.Button)]
            screenshot('controls')
            if phase == 'before':
                check(any('Window context enabled' in text for text in labels),
                      'Baseline reproduces permission-only enabled observation label')
                check('Hide companion' not in buttons, 'Baseline reproduces missing hide action')
                report = {'passed': len(checks), 'checks': checks, 'labels': labels, 'buttons': buttons}
                (output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
                completed = True
                window.destroy()
            else:
                check('Allowed · no recent observer report' in labels,
                      'Permission without report is not active observation')
                check(any('metadata polling enabled' in label for label in labels),
                      'Explicitly launched helper states its own polling status separately')
                check('Companion menu' in buttons and 'Hide companion' not in buttons,
                      'Task panel keeps secondary controls behind menu')
                check('Synthetic parser notes' in labels and 'Inspect the synthetic example.' in labels,
                      'Connected native panel shows actual available work and saved action')
                click('Companion menu')
                buttons = [w.get_label() for w in widgets(app.popover) if isinstance(w, Gtk.Button)]
                check('Hide companion' in buttons and 'Pause this observer' in buttons,
                      'Real companion menu exposes hide and local observation pause')
                check('56 px' not in buttons and '40 px' in buttons,
                      'Native size controls remain tiny')
                check(GtkLayerShell.get_keyboard_mode(window) == GtkLayerShell.KeyboardMode.NONE
                      and not app.popover.get_modal(),
                      'Opened controls stay non-modal and never request keyboard focus')
                app.set_size(40)
                later(check_size)
        except Exception:
            traceback.print_exc()
            Gtk.main_quit()
        return False
    def click(label):
        app.show_popover()
        if label not in ('Companion menu', 'Open task in Noema', 'Close'):
            app.show_menu()
        button = next(w for w in widgets(app.popover)
                      if isinstance(w, Gtk.Button) and w.get_label() == label)
        button.clicked()
    def check_size():
        check(app.button.get_allocated_width() == 56
              and app.button.get_child().get_storage_type() == Gtk.ImageType.SURFACE,
              '40-pixel native sprite uses a scale-aware surface in a 56-pixel container')
        click('Dot')
        later(check_dot)
    def check_dot():
        check(isinstance(app.button.get_child(), Gtk.Label), 'Dot mode changes the real GTK child')
        check(not app.popover.get_visible(), 'Appearance controls dismiss instead of becoming a permanent overlay')
        check(GtkLayerShell.get_keyboard_mode(app.window) == GtkLayerShell.KeyboardMode.NONE,
              'Closed controls release keyboard interaction')
        click('Cat')
        click('Pause this observer')
        later(check_pause)
    def check_pause():
        check(app.observation_paused.is_set(), 'Pause control gates this helper polling')
        app.show_menu()
        labels = [w.get_text() for w in widgets(app.popover) if isinstance(w, Gtk.Label)]
        check(any('This helper: paused' in label for label in labels),
              'Local pause is not confused with global permission or another observer')
        def capture_paused():
            screenshot('paused')
            click('Resume this observer')
            check(not app.observation_paused.is_set(), 'Resume is explicit and retains server permission gate')
            click('Hide companion')
            later(check_hidden)
        later(capture_paused, 400)
    def check_hidden():
        check(not app.window.get_visible(), 'Hidden mode actually unmaps the native surface')
        app.local_mode = None  # Test reset of local appearance, not an app restore command.
        app.apply(app.summary, None)
        context = {'stale': False, 'workspace': '2', 'monitor': 'HEADLESS-2'}
        from sway_context import sway_json
        subprocess.run(['swaymsg', '-r', 'workspace 2; move workspace to output HEADLESS-2'],
                       check=True, capture_output=True)
        from companion_state import workspace_placement
        placement = workspace_placement(context, sway_json('get_workspaces'))
        app.apply(app.summary, placement)
        later(check_monitor)
    def check_monitor():
        monitor = GtkLayerShell.get_monitor(app.window)
        check(monitor is not None and monitor.get_geometry().x == 1440,
              'Actual layer surface follows the second synthetic output')
        hidden_placement = {**app.placement, 'visible': False}
        app.apply(app.summary, hidden_placement)
        app.show_popover()
        app.set_mode('dot')
        check(not app.window.get_visible(), 'Local mode does not resurrect a hidden workspace companion')
        # Return to first output for subsequent screenshots.
        app.local_mode = None
        from sway_context import sway_json
        workspace = next(w for w in sway_json('get_workspaces') if w['output'] == 'HEADLESS-1')
        app.apply(app.summary, {'visible': True, 'rect': workspace['rect']})
        app.local_mode = 'dot'
        app.apply({**app.summary, 'settings': {**app.summary['settings'], 'companion': 'hidden'}}, None)
        check(not app.window.get_visible(), 'Server Hidden wins over a local Dot override')
        app.local_mode = None
        app.apply(app.client.request('/companion'), None)
        later(check_server_unavailable)
    def check_server_unavailable():
        app.unavailable()  # Explicit outage injection, not a real production outage.
        app.show_popover()
        labels = [w.get_text() for w in widgets(app.popover) if isinstance(w, Gtk.Label)]
        check('Server unavailable · observation not confirmed' in labels,
              'Disconnected controls do not claim current observation')
        check(not any('Synthetic parser notes' in label for label in labels),
              'Disconnected controls suppress cached actionable work')
        def capture_disconnected():
            screenshot('disconnected')
            app.close_popover()
            app.apply(app.client.request('/companion'), None)
            later(check_desktop)
        later(capture_disconnected, 400)
    def check_desktop():
        from sway_context import sway_json
        def nodes(tree):
            yield tree
            for child in tree.get('nodes', []) + tree.get('floating_nodes', []):
                yield from nodes(child)
        pid = int(os.environ['NOEMA_QA_DESKTOP_PID'])
        desktop = next(node for node in nodes(sway_json('get_tree')) if node.get('pid') == pid)
        check(desktop.get('app_id') is not None, 'Rust webview maps as a real native Wayland window')
        selector = '[con_id=' + str(desktop['id']) + ']'
        subprocess.run(['swaymsg', '-r', selector + ' move scratchpad'], check=True, capture_output=True)
        def hidden_desktop():
            tree = sway_json('get_tree')
            scratch = next(node for node in nodes(tree) if node.get('name') == '__i3_scratch')
            check(any(node.get('pid') == pid for node in nodes(scratch)),
                  'Sway scratchpad hide contains only the fixture desktop')
            subprocess.run(['swaymsg', '-r', selector + ' scratchpad show'], check=True, capture_output=True)
            later(restored_desktop)
        def restored_desktop():
            tree = sway_json('get_tree')
            scratch = next(node for node in nodes(tree) if node.get('name') == '__i3_scratch')
            check(not any(node.get('pid') == pid for node in nodes(scratch)),
                  'Rust webview restores from compositor hide without relaunch')
            screenshot('restored-desktop')
            check_metadata()
        later(hidden_desktop)
    def check_metadata():
        work = Gtk.Window(title='Synthetic parser window')
        work.set_default_size(500, 300)
        work.add(Gtk.Label(label='Disposable fixture window. No private content.'))
        work.show_all()
        def report_context():
            from sway_context import Observer, sway_json, focused_context
            metadata = focused_context(sway_json('get_tree'))
            check(metadata and metadata['title'] == 'Synthetic parser window',
                  'Observer reads actual private-compositor fixture window metadata')
            previous = app.client.request('/companion')['focus']
            observer = Observer(app.client)
            observer.step()
            observer.step()
            summary = app.client.request('/companion')
            check(summary['context']['title'] == 'Synthetic parser window'
                  and summary['context']['suggested_task_id'] != previous['task_id'],
                  'Real scoped observer report matches a competing synthetic task rule')
            check(summary['focus']['task_id'] == previous['task_id'] and summary['focus']['pinned'],
                  'Actual metadata inference never overrides pinned focus')
            app.apply(summary, app.placement)
            check(app.button.get_tooltip_text().startswith('Recent window metadata report'),
                  'Only an actual fresh report earns the recent-metadata label')
            app.observation_paused.set()
            work.destroy()
            finish()
        later(report_context, 500)
    def finish():
        nonlocal completed
        (output / 'results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks}, indent=2) + '\n')
        completed = True
        app.window.destroy()
    GLib.timeout_add(100, inspect)
    GLib.timeout_add_seconds(40, lambda: (Gtk.main_quit(), False)[1])
    sys.argv = [str(source), '--url', os.environ['NOEMA_QA_URL']]
    if phase == 'before':
        module.main()
    else:
        from client import Client
        app = module.Companion(Client(os.environ['NOEMA_QA_URL']), observe_window_context=True)
        # Execute a real HTTP/observer poll, then drive GTK explicitly. A timer
        # thread must not overwrite the deliberately injected placement/outage
        # fixtures midway through their assertions. No fake API/GTK widgets.
        from sway_context import Observer
        app.poll_once(Observer(app.client))
        Gtk.main()
    if not completed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
