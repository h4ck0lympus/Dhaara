"""Actual native GTK visibility probe; run only through sway_check.py --visibility.

Uses an isolated compositor/service and programmatic GTK clicks, not a physical
pointer. Screenshots are unmodified grim output. No user's desktop is accessed.
"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('GtkLayerShell', '0.1')
from gi.repository import Gtk, GtkLayerShell
from client import Client
from sway_context import sway_json


def descendants(widget):
    yield widget
    if isinstance(widget, Gtk.Container):
        for child in widget.get_children():
            yield from descendants(child)


def pump(seconds=.35):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        while Gtk.events_pending():
            Gtk.main_iteration_do(False)
        time.sleep(.01)


def main():
    runtime = Path(os.environ['DHARA_QA_PRIVATE_RUNTIME']).resolve()
    sock = Path(os.environ['SWAYSOCK']).resolve()
    pid = os.environ['DHARA_QA_COMPOSITOR_PID']
    if (not runtime.parent.name.startswith('dhara-sway-qa-') or sock.parent != runtime
            or not sock.name.endswith('.' + pid + '.sock')
            or Path(os.environ['XDG_RUNTIME_DIR']).resolve() != runtime):
        raise SystemExit('Refusing to probe a non-fixture compositor')
    output = Path(os.environ['DHARA_QA_OUTPUT'])
    before = os.environ['DHARA_QA_PHASE'] == 'before'
    source = Path(os.environ.get('DHARA_QA_SOURCE', ROOT / 'tools/sway_companion.py'))
    spec = importlib.util.spec_from_file_location('visibility_companion', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.__file__ = str(ROOT / 'tools/sway_companion.py')
    app = module.Companion(Client(os.environ['DHARA_QA_URL']), observe_window_context=True)
    checks, measurements, opened = [], [], []
    module.webbrowser.open = lambda url: opened.append(url)  # Do not launch a real browser.
    def check(ok, label):
        assert ok, label
        checks.append(label)
    def command(text):
        result = subprocess.run(['swaymsg', '-r', text], capture_output=True, text=True, check=True)
        assert all(item.get('success') for item in json.loads(result.stdout)), result.stdout
        pump()
    def screenshot(name):
        pump()
        subprocess.run(['grim', '-o', 'HEADLESS-1', str(output / (name + '.png'))], check=True)
    def button(label):
        return next(w for w in descendants(app.popover)
                    if isinstance(w, Gtk.Button) and w.get_label() == label)
    def labels():
        return [w.get_text() for w in descendants(app.popover) if isinstance(w, Gtk.Label)]
    def nodes(node):
        yield node
        for child in node.get('nodes', []) + node.get('floating_nodes', []):
            yield from nodes(child)
    def focused():
        return next((n.get('id') for n in nodes(sway_json('get_tree')) if n.get('focused')), None)
    pump(2)
    summary = app.client.request('/companion')
    target = next(w for w in sway_json('get_workspaces') if w['output'] == 'HEADLESS-1')
    app.apply(summary, {'visible': True, 'rect': target['rect']})
    # Focus a real fixture window on the other output, leaving HEADLESS-1 clear.
    command('workspace 2; move workspace to output HEADLESS-2')
    work = Gtk.Window(title='Synthetic focus sentinel')
    work.add(Gtk.Label(label='Disposable focus check. No private content.'))
    work.show_all()
    pump()
    check(focused() is not None, 'A real fixture application owns keyboard focus')
    check(not summary['settings']['observation_enabled'], 'Fixture starts with observation permission off')
    check(GtkLayerShell.get_exclusive_zone(app.window) == 0, 'Surface reserves no desktop layout space')
    for scale in (1, 1.5, 2):
        command('output HEADLESS-1 scale ' + str(scale))
        app.apply(summary, None)
        pump()
        for name, color in (('dark', '#101110'), ('light', '#eeeae0')):
            command('output HEADLESS-1 bg ' + color + ' solid_color')
            screenshot(name + '-' + str(scale) + 'x')
        allocation = app.button.get_allocation()
        monitor = app.window.get_display().get_monitor_at_window(app.window.get_window())
        geometry = monitor.get_geometry()
        measured = {'output_scale': scale, 'gtk_buffer_scale': app.window.get_scale_factor(),
                    'container_logical': [allocation.width, allocation.height],
                    'surface_logical': list(app.window.get_size()),
                    'monitor_logical': [geometry.width, geometry.height]}
        measurements.append(measured)
        actual = next(o for o in sway_json('get_outputs') if o['name'] == 'HEADLESS-1')
        check(actual['scale'] == scale, 'Actual private compositor uses scale ' + str(scale))
        check(allocation.width < geometry.width - 32 and allocation.height < geometry.height - 32,
              'Anchored surface fits intended output at scale ' + str(scale))
        if not before:
            check((allocation.width, allocation.height) == (56, 56),
                  '40 logical-pixel kitten has 56 logical-pixel container at scale ' + str(scale))
            previous = focused()
            app.button.clicked()
            pump()
            check(focused() == previous, 'Panel preserves active fixture focus at scale ' + str(scale))
            check(app.popover.get_allocated_height() < geometry.height - 32
                  and app.popover.get_allocated_width() < geometry.width - 32,
                  'Adjacent task panel fits monitor at scale ' + str(scale))
            button('Companion menu').clicked()
            pump()
            initial_fit = app.popover.get_allocated_height() < geometry.height - 32
            # Change scale while controls are still open, then restore this case.
            command('output HEADLESS-1 scale ' + str(2 if scale == 1 else 1))
            changed_geometry = monitor.get_geometry()
            live_fit = app.popover.get_visible() and app.popover.get_allocated_height() < changed_geometry.height - 32
            command('output HEADLESS-1 scale ' + str(scale))
            check(initial_fit and live_fit and app.popover.get_allocated_height() < geometry.height - 32,
                  'Secondary menu fits monitor at scale ' + str(scale) + ', including live scale changes')
            if scale == 2:
                screenshot('menu-2x')
            app.close_popover()
    command('output HEADLESS-1 scale 1; output HEADLESS-1 bg #101110 solid_color')
    app.apply(summary, None)
    previous = focused()
    app.button.clicked()
    pump()
    screenshot('task-panel')
    if not before:
        check(not app.popover.get_modal(), 'Adjacent panel is non-modal, with no full-screen input grab')
        check(GtkLayerShell.get_keyboard_mode(app.window) == GtkLayerShell.KeyboardMode.NONE,
              'Opened task panel does not request keyboard focus')
        check(focused() == previous, 'Opening the panel preserves compositor keyboard focus')
        check('Synthetic parser notes' in labels() and 'Inspect the synthetic example.' in labels(),
              'One next available task and its actual saved action are shown')
        check('Synthetic allocator notes' not in labels(), 'Panel does not replace pinned focus or list extra tasks')
        check(not any(w.get_label() == 'Hide companion' for w in descendants(app.popover)
                      if isinstance(w, Gtk.Button)), 'Secondary controls are absent from default task panel')
        button('Open task in Dhara').clicked()
        check(opened == [app.client.url + '/#task/' + summary['next'][0]['id']],
              'Task button requests the real task-detail route (browser launch intercepted)')
        app.show_popover()
        app.apply({**summary, 'next': []}, None)  # Explicit task-state presentation injection.
        pump()
        check('Synthetic parser notes' not in labels() and 'Open Plan' in [
            w.get_label() for w in descendants(app.popover) if isinstance(w, Gtk.Button)],
            'An open panel refreshes when available work disappears instead of retaining a stale action')
        app.apply(summary, None)
        app.show_popover()
        button('Companion menu').clicked()
        pump()
        screenshot('menu')
        check('This helper: waiting for permission · no screenshots' in labels(),
              'Menu distinguishes helper permission gate from active observation')
        button('Pause this observer').clicked()
        check(app.observation_paused.is_set(), 'Explicit local pause gates polling')
        app.show_popover()
        button('Companion menu').clicked()
        button('Resume this observer').clicked()
        check(not app.observation_paused.is_set(), 'Explicit resume retains the server permission gate')
    app.set_mode('dot')
    screenshot('dot-dark')
    command('output HEADLESS-1 bg #eeeae0 solid_color')
    screenshot('dot-light')
    check(isinstance(app.button.get_child(), Gtk.Label), 'Explicit dot mode replaces kitten rendering')
    app.set_mode('hidden')
    screenshot('hidden')
    check(not app.window.get_visible(), 'Explicit hidden mode unmaps native popup')
    app.local_mode = 'cat'  # Fixture reset, not a user-facing hidden-mode restore command.
    app.set_size(32)
    screenshot('cat-32-light')
    if not before:
        check(app.button.get_allocated_width() == 48, '32 logical-pixel kitten has a 48 logical-pixel container')
        app.unavailable()  # Explicit disconnected-state injection; not a network outage.
        app.show_popover()
        pump()
        check('Server unavailable · observation not confirmed' in labels(), 'Disconnected status is truthful')
        check('Synthetic parser notes' not in labels(), 'Disconnected panel does not present cached work as current')
        screenshot('disconnected')
    current = app.client.request('/companion')
    check(not current['settings']['observation_enabled'] and not current['context'],
          'Appearance, clicks, pause/resume and mode changes never enable or report observation')
    check(current['focus'] == summary['focus'], 'Pinned focus is unchanged by every popup interaction')
    if not before:
        # Explicit long-text fixture injection; no service or task mutation.
        long_item = {**summary['next'][0], 'title': 'Long synthetic task ' * 12,
                     'next_action': 'synthetic_identifier_' * 50}
        app.apply({**summary, 'next': [long_item]}, None)
        app.show_popover()
        pump()
        check(app.popover.get_allocated_height() < 480 and app.popover.get_allocated_width() < 400,
              'Maximum-length and unbroken synthetic text stays in compact panel')
        screenshot('long-text')
    report = {'passed': len(checks), 'checks': checks, 'measurements': measurements,
              'injections': ['GTK button signals; not physical pointer input'] + ([] if before else [
                             'Browser URL recording; external browser launch not exercised',
                             'Disconnected, task-state and long-text summaries explicitly injected']),
              'screenshots': sorted(p.name for p in output.glob('*.png'))}
    (output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    work.destroy()
    app.window.destroy()
    pump(.1)


if __name__ == '__main__':
    main()
