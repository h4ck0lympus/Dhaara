"""Private Sway pointer delivery, never the user's seat or desktop.

Run only via sway_check.py --pointer. No Gtk.Button.clicked calls: Sway cursor
press/release commands deliver actual Wayland pointer events to native widgets.
This is headless compositor input, not physical mouse or monitor validation.
"""
import json
import os
from pathlib import Path
import subprocess
import sys

from kitten_visibility_probe import ROOT, descendants, pump, Gtk, GtkLayerShell
from client import Client
from sway_companion import Companion
from sway_context import sway_json


def main():
    runtime = Path(os.environ['DHARA_QA_PRIVATE_RUNTIME']).resolve()
    sock = Path(os.environ['SWAYSOCK']).resolve()
    compositor_pid = os.environ['DHARA_QA_COMPOSITOR_PID']
    if (not runtime.parent.name.startswith('dhara-sway-qa-') or sock.parent != runtime
            or not sock.name.endswith('.' + compositor_pid + '.sock')
            or Path(os.environ['XDG_RUNTIME_DIR']).resolve() != runtime):
        raise SystemExit('Refusing pointer input outside a private fixture compositor')
    output = Path(os.environ['DHARA_QA_OUTPUT'])
    app = Companion(Client(os.environ['DHARA_QA_URL']), observe_window_context=True)
    checks, coordinates, opened = [], [], []
    import sway_companion
    sway_companion.webbrowser.open = lambda url: opened.append(url)
    def check(ok, label):
        assert ok, label
        checks.append(label)
    def command(value):
        result = subprocess.run(['swaymsg', '-r', value], capture_output=True, text=True, check=True, timeout=5)
        assert all(r.get('success') for r in json.loads(result.stdout)), result.stdout
        pump(.12)
    def nodes(node):
        yield node
        for child in node.get('nodes', []) + node.get('floating_nodes', []):
            yield from nodes(child)
    def focused():
        return next((n['id'] for n in nodes(sway_json('get_tree')) if n.get('focused')), None)
    def monitor_rect():
        return next(o['rect'] for o in sway_json('get_outputs') if o['name'] == 'HEADLESS-1')
    def origin():
        rect = monitor_rect()
        width, height = app.window.get_size()
        return rect['x'] + rect['width'] - 16 - width, rect['y'] + rect['height'] - 16 - height
    def cursor_click(x, y):
        command('seat seat0 cursor set ' + str(round(x)) + ' ' + str(round(y)))
        command('seat seat0 cursor press button1')
        command('seat seat0 cursor release button1')
        pump(.2)
    def click(widget, label):
        point = widget.translate_coordinates(app.window, widget.get_allocated_width() // 2,
                                             widget.get_allocated_height() // 2)
        assert point is not None, 'Cannot translate native widget: ' + label
        x, y = origin()
        coordinates.append({'label': label, 'root': [x + point[0], y + point[1]],
                            'relative': list(point)})
        cursor_click(x + point[0], y + point[1])
    def button(label):
        return next(w for w in descendants(app.popover) if isinstance(w, Gtk.Button) and w.get_label() == label)
    def screenshot(name):
        subprocess.run(['grim', '-o', 'HEADLESS-1', str(output / (name + '.png'))], check=True, timeout=5)
    pump(2)
    command('workspace 1; move workspace to output HEADLESS-1')
    work = Gtk.Window(title='Synthetic input sentinel')
    work_button = Gtk.Button(label='Synthetic work area · clicks must remain available')
    work_clicks = []
    work_button.connect('clicked', lambda *_: work_clicks.append(True))
    work.add(work_button)
    work.show_all()
    summary = app.client.request('/companion')
    app.apply(summary, {'visible': True, 'rect': monitor_rect()})
    pump()
    previous = focused()
    cursor_click(50, 50)
    check(len(work_clicks) == 1, 'Calibration: private pointer reaches the real work window')
    check(previous is not None, 'A real fixture work window owns focus')
    check(not summary['settings']['observation_enabled'], 'Observation permission starts off')
    for scale in (1, 1.5, 2):
        command('output HEADLESS-1 scale ' + str(scale))
        app.apply(summary, {'visible': True, 'rect': monitor_rect()})
        pump()
        click(app.button, 'Cat at ' + str(scale))
        screenshot('pointer-panel-' + str(scale) + 'x')
        check(app.popup_open and app.popover.get_visible(), 'Compositor pointer opens cat panel at ' + str(scale))
        check(focused() == previous, 'Cat click preserves work-window keyboard focus at ' + str(scale))
        check(not app.popover.get_modal()
              and GtkLayerShell.get_keyboard_mode(app.window) == GtkLayerShell.KeyboardMode.NONE,
              'Panel remains non-modal and keyboard-inert at ' + str(scale))
        click(button('Companion menu'), 'Menu at ' + str(scale))
        check(app.controls_open, 'Compositor pointer opens secondary menu at ' + str(scale))
        click(button('Dot'), 'Dot at ' + str(scale))
        check(app.local_mode == 'dot' and not app.popup_open, 'Pointer selects Dot and dismisses controls at ' + str(scale))
        click(app.button, 'Dot popup at ' + str(scale))
        check(app.popup_open, 'Explicit dot remains clickable at ' + str(scale))
        click(button('Companion menu'), 'Dot menu at ' + str(scale))
        click(button('Cat'), 'Restore Cat at ' + str(scale))
        click(app.button, 'Reopen Cat at ' + str(scale))
        before_clicks = len(work_clicks)
        cursor_click(50, 50)
        check(len(work_clicks) == before_clicks + 1, 'Outside click reaches work app, not an input-blocking overlay at ' + str(scale))
        if not app.popup_open:
            click(app.button, 'Reopen after outside click')
        click(button('Close'), 'Close at ' + str(scale))
        check(not app.popup_open, 'Compositor pointer closes panel at ' + str(scale))
        check(focused() == previous, 'All pointer interactions preserve work-window focus at ' + str(scale))
    click(app.button, 'Task action popup')
    click(button('Open task in Dhara'), 'Open saved task')
    check(opened == [app.client.url + '/#task/' + summary['next'][0]['id']]
          and not app.popup_open, 'Pointer activates actual task URL and dismisses panel (browser dispatch intercepted)')
    click(app.button, 'Appearance popup')
    click(button('Companion menu'), 'Appearance menu')
    click(button('32 px'), '32 logical px')
    pump()
    check(app.local_size == 32 and app.button.get_allocated_width() == 48
          and not app.popup_open, 'Pointer selects 32/48 logical sizing and dismisses menu')
    click(app.button, 'Observer popup')
    click(button('Companion menu'), 'Observer menu')
    click(button('Pause this observer'), 'Pause')
    check(app.observation_paused.is_set() and not app.popup_open, 'Pointer pauses local observer')
    click(app.button, 'Paused popup')
    click(button('Companion menu'), 'Paused menu')
    click(button('Resume this observer'), 'Resume')
    check(not app.observation_paused.is_set()
          and app.helper_status() == 'This helper: waiting for permission',
          'Pointer resumes local flag without granting observation permission')
    click(app.button, 'Hide popup')
    click(button('Companion menu'), 'Hide menu')
    click(button('Hide companion'), 'Explicit Hidden')
    check(app.local_mode == 'hidden' and not app.window.get_visible()
          and not app.popup_open, 'Pointer selects explicit Hidden with no remaining panel')
    before_clicks = len(work_clicks)
    cursor_click(672, 432)
    check(len(work_clicks) == before_clicks + 1, 'Hidden companion leaves its former hit target available to work app')
    check(focused() == previous, 'Task, size, pause/resume and Hidden retain work-window keyboard focus')
    current = app.client.request('/companion')
    check(not current['settings']['observation_enabled'] and not current['context'], 'Pointer interaction never enables observation')
    check(current['focus'] == summary['focus'], 'Pointer interactions never replace pinned focus')
    report = {'passed': len(checks), 'checks': checks, 'coordinates': coordinates,
              'injections': ['Compositor-generated pointer events, not physical input',
                             'External browser launch intercepted; no OS dispatch claim']}
    (output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    work.destroy()
    app.window.destroy()
    pump(.1)


if __name__ == '__main__':
    main()
