#!/usr/bin/env python3
"""Experimental tiny GTK3/layer-shell companion for Sway.

No browser/webview, model or screenshots. Window-metadata observation requires
both --observe-window-context and server permission; local pause gates polling.
Local appearance choices reset on restart. Server Hidden always takes priority.
"""
import argparse
import os
from pathlib import Path
import threading
import webbrowser

from client import Client
from companion_state import observation_status, visual_settings, workspace_placement
from sway_context import Observer, sway_json


class Companion:
    def __init__(self, client, observe_window_context=False):
        import gi
        gi.require_version('Gtk', '3.0')
        gi.require_version('GtkLayerShell', '0.1')
        from gi.repository import Gtk, Gdk, GdkPixbuf, GLib, GtkLayerShell, Pango
        if not GtkLayerShell.is_supported():
            raise ValueError('Your compositor does not support layer-shell.')
        self.Gtk, self.Gdk, self.GdkPixbuf = Gtk, Gdk, GdkPixbuf
        self.GLib, self.layer = GLib, GtkLayerShell
        self.Pango = Pango
        self.client = client
        self.observe_window_context = observe_window_context
        self.observation_paused = threading.Event()
        self.stop = threading.Event()
        self.summary = {'settings': {}, 'next': []}
        self.connected = False
        self.placement = None
        self.local_mode = self.local_size = self.visual_key = self.popover = None
        self.status_label = self.helper_label = None
        self.controls_open = False
        self.popup_open = False
        self.window = Gtk.Window(title='Dhara companion')
        self.window.set_decorated(False)
        self.window.set_resizable(False)
        self.window.set_app_paintable(True)
        self.window.get_style_context().add_class('dhara-companion')
        visual = self.window.get_screen().get_rgba_visual()
        if visual:
            self.window.set_visual(visual)
        GtkLayerShell.init_for_window(self.window)
        GtkLayerShell.set_namespace(self.window, 'dhara-companion')
        GtkLayerShell.set_layer(self.window, GtkLayerShell.Layer.TOP)
        GtkLayerShell.set_keyboard_mode(self.window, GtkLayerShell.KeyboardMode.NONE)
        for edge in (GtkLayerShell.Edge.BOTTOM, GtkLayerShell.Edge.RIGHT):
            GtkLayerShell.set_anchor(self.window, edge, True)
            GtkLayerShell.set_margin(self.window, edge, 16)
        GtkLayerShell.set_exclusive_zone(self.window, 0)
        css = Gtk.CssProvider()
        css.load_from_data(b'''
            window.dhara-companion {background:transparent;}
            .kitten-bubble {background:transparent; border:0;
                border-radius:15px; box-shadow:none;
                padding:0; min-width:0; min-height:0;}
            .kitten-bubble:hover {background:rgba(140,160,190,0.08);}
            .kitten-bubble.dot-mode {background:#d2dae8; border:1px solid #657080; border-radius:10px;}
            .kitten-bubble label {color:#35412d; font-size:12px;}
            popover.kitten-panel {background:#111316; color:#e2e5eb;
                border:1px solid #3a414f; border-radius:10px;}
            .kitten-panel label {color:#e2e5eb; font-size:13px;}
            .kitten-panel button {background:#20252d; color:#e2e5eb;
                border:1px solid #3a414f; border-radius:5px;
                box-shadow:none; padding:5px 8px; min-width:0; min-height:0;}
            .kitten-panel button:hover {background:#2d3440;}
        ''')
        Gtk.StyleContext.add_provider_for_screen(self.window.get_screen(), css,
                                               Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        self.button = Gtk.Button()
        self.button.get_style_context().add_class('kitten-bubble')
        for edge in ('top', 'bottom', 'start', 'end'):
            getattr(self.button, 'set_margin_' + edge)(4)
        self.button.set_can_focus(False)
        self.button.get_accessible().set_name('Dhara companion controls')
        self.window.add(self.button)
        self.button.connect('clicked', self.toggle_popover)
        self.window.connect('notify::scale-factor', self.scale_changed)
        self.window.connect('destroy', self.quit)
        self.apply(self.summary, None, connected=False)

    def helper_status(self):
        if not self.observe_window_context:
            return 'This helper: not observing'
        if self.observation_paused.is_set():
            return 'This helper: paused'
        if not self.connected:
            return 'This helper: waiting for server'
        if not self.summary.get('settings', {}).get('observation_enabled'):
            return 'This helper: waiting for permission'
        return 'This helper: metadata polling enabled'

    def dismiss_popover(self, pop=None, *_):
        if pop is not None and pop is not self.popover:
            return
        self.popup_open = False
        self.layer.set_keyboard_mode(self.window, self.layer.KeyboardMode.NONE)

    def close_popover(self, *_):
        if self.popover:
            self.popover.popdown()
            self.popover.hide()
        self.dismiss_popover()

    def scale_changed(self, *_):
        self.apply(self.summary, self.placement, self.connected)

    def toggle_popover(self, *_):
        if self.popup_open:
            self.close_popover()
        else:
            self.show_popover()

    def show_menu(self, *_):
        self.show_popover(controls=True)

    def open_dhara(self, suffix):
        self.close_popover()
        webbrowser.open(self.client.url + suffix)

    def show_popover(self, *_, controls=False):
        Gtk = self.Gtk
        self.controls_open = controls
        self.status_label = self.helper_label = None
        if self.popover:
            self.popover.destroy()
        pop = Gtk.Popover.new(self.button)
        pop.set_modal(False)
        pop.set_position(Gtk.PositionType.TOP)
        pop.get_style_context().add_class('kitten-panel')
        self.popover = pop
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        box.set_border_width(10)
        box.set_size_request(240, -1)
        monitor = self.layer.get_monitor(self.window) or self.window.get_display().get_monitor_at_window(
            self.window.get_window())
        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scroll.set_propagate_natural_height(True)
        scroll.set_max_content_height(max(120, monitor.get_geometry().height - 112))
        scroll.add(box)
        pop.add(scroll)
        def text(value):
            label = Gtk.Label(label=value, xalign=0)
            label.set_line_wrap(True)
            label.set_line_wrap_mode(self.Pango.WrapMode.WORD_CHAR)
            label.set_max_width_chars(32)
            label.set_ellipsize(self.Pango.EllipsizeMode.END)
            label.set_lines(4)
            box.pack_start(label, False, False, 0)
            return label
        def action(label, callback):
            button = Gtk.Button(label=label)
            button.set_can_focus(False)
            button.connect('clicked', callback)
            box.pack_start(button, False, False, 0)
            return button
        if not controls:
            attention = self.summary.get('attention', []) if self.connected else []
            items = (attention or self.summary.get('next', [])) if self.connected else []
            if items:
                item = items[0]
                text('Needs you' if attention else 'Next available')
                text(item['title'])
                text(item.get('next_action') or 'No next action saved. Open the task to choose one.')
                action('Open task in Dhara', lambda *_: self.open_dhara('/#task/' + item['id']))
            elif self.connected:
                text('No other available task in the current summary.')
                action('Open Plan', lambda *_: self.open_dhara('/#plan'))
            self.status_label = text(observation_status(self.summary, self.connected))
            self.helper_label = text(self.helper_status() + ' · no screenshots')
            action('Companion menu', self.show_menu)
            action('Close', self.close_popover)
        else:
            text('Companion controls')
            self.status_label = text(observation_status(self.summary, self.connected))
            self.helper_label = text(self.helper_status() + ' · no screenshots')
            self.add_controls(box, text, action)
            action('Back to task', self.show_popover)
            action('Close', self.close_popover)
        pop.connect('closed', self.dismiss_popover)
        pop.connect('destroy', self.dismiss_popover)
        self.popup_open = True
        pop.show_all()
        pop.popup()

    def add_controls(self, box, text, action):
        Gtk = self.Gtk
        modes = Gtk.Box(spacing=6)
        for value in ('cat', 'dot', 'hidden'):
            button = Gtk.Button(label='Hide companion' if value == 'hidden' else value.title())
            if value == 'hidden':
                button.set_tooltip_text('Hidden until you restart this helper. Does not change server preferences.')
            button.connect('clicked', lambda _, v=value: self.set_mode(v))
            modes.pack_start(button, False, False, 0)
        box.pack_start(modes, False, False, 0)
        sizes = Gtk.Box(spacing=6)
        for value in (24, 40, 56, 72):
            button = Gtk.Button(label=str(value) + ' px')
            button.connect('clicked', lambda _, v=value: self.set_size(v))
            sizes.pack_start(button, False, False, 0)
        box.pack_start(sizes, False, False, 0)
        text('Local appearance · resets on restart')
        if self.observe_window_context:
            label = 'Resume this observer' if self.observation_paused.is_set() else 'Pause this observer'
            action(label, self.toggle_observation)
        for label, suffix in (('Observation settings', '/#settings'), ('Open Dhara', '/')):
            action(label, lambda _, path=suffix: self.open_dhara(path))
        action('Quit companion', lambda *_: self.window.destroy())

    def set_mode(self, mode):
        self.local_mode = mode
        self.close_popover()
        self.apply(self.summary, self.placement, self.connected)

    def set_size(self, size):
        self.local_size = size
        self.close_popover()
        self.apply(self.summary, self.placement, self.connected)

    def toggle_observation(self, *_):
        if self.observation_paused.is_set():
            self.observation_paused.clear()
        else:
            self.observation_paused.set()
        self.close_popover()
        self.apply(self.summary, self.placement, self.connected)

    def apply(self, summary, placement, connected=True):
        if self.stop.is_set():
            return False
        next_changed = (self.summary.get('next'), self.summary.get('attention')) != (summary.get('next'), summary.get('attention'))
        placement_changed = self.placement != placement
        self.summary, self.placement, self.connected = summary, placement, connected
        mode, size = visual_settings(summary.get('settings', {}), self.local_mode, self.local_size)
        if mode == 'hidden' or (placement and not placement['visible']):
            if self.popover:
                self.popover.popdown()
            self.dismiss_popover()
            self.window.hide()
            return False
        if placement and placement.get('rect'):
            rect = placement['rect']
            display = self.Gdk.Display.get_default()
            monitor = display.get_monitor_at_point(int(rect['x'] + rect['width'] / 2),
                                                  int(rect['y'] + rect['height'] / 2))
            if monitor:
                self.layer.set_monitor(self.window, monitor)
        scale = self.window.get_scale_factor()
        key = (mode, size, scale)
        visual_changed = key != self.visual_key
        if visual_changed:
            old = self.button.get_child()
            if old:
                self.button.remove(old)
            if mode == 'dot':
                self.button.get_style_context().add_class('dot-mode')
                self.button.set_size_request(20, 20)
                image = self.Gtk.Label(label='•')
            else:
                self.button.get_style_context().remove_class('dot-mode')
                self.button.set_size_request(size + 16, size + 16)
                sprite = Path(__file__).resolve().parents[1] / 'tools/assets/kitten-illustrated.png'
                pixbuf = self.GdkPixbuf.Pixbuf.new_from_file(str(sprite))
                height = max(1, round(size * pixbuf.get_height() / pixbuf.get_width()))
                pixbuf = pixbuf.scale_simple(size * scale, height * scale,
                                            self.GdkPixbuf.InterpType.BILINEAR)
                surface = self.Gdk.cairo_surface_create_from_pixbuf(pixbuf, scale, None)
                image = self.Gtk.Image.new_from_surface(surface)
            self.button.add(image)
            self.window.resize(1, 1)
            self.visual_key = key
        status = observation_status(summary, connected)
        self.button.set_tooltip_text(status + '\n' + self.helper_status() + '\nClick for local controls')
        if self.status_label:
            self.status_label.set_text(status)
            self.helper_label.set_text(self.helper_status() + ' · no screenshots')
        self.button.get_child().show()
        self.button.show()
        self.window.show()
        if self.popup_open and self.popover and self.popover.get_visible() and (
                visual_changed or placement_changed or (next_changed and not self.controls_open)):
            self.show_popover(controls=self.controls_open)
        return False

    def unavailable(self):
        if self.stop.is_set():
            return False
        self.connected = False
        if self.popover:
            self.popover.popdown()
        self.dismiss_popover()
        self.button.set_tooltip_text(observation_status(self.summary, False))
        return False

    def poll_once(self, observer):
        summary = self.client.request('/companion')
        if self.observe_window_context and not self.observation_paused.is_set():
            observer.step(summary)
        context = summary.get('context') or {}
        placement = workspace_placement(context, sway_json('get_workspaces')) if (
            context and not context.get('stale', True)) else None
        self.GLib.idle_add(self.apply, summary, placement)

    def poll(self):
        observer = Observer(self.client)
        while not self.stop.is_set():
            try:
                self.poll_once(observer)
            except Exception:
                self.GLib.idle_add(self.unavailable)
            self.stop.wait(5)

    def quit(self, *_):
        self.stop.set()
        if self.Gtk.main_level():
            self.Gtk.main_quit()

    def run(self):
        threading.Thread(target=self.poll, name='dhara-companion-poll', daemon=True).start()
        self.Gtk.main()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8765')
    parser.add_argument('--observe-window-context', action='store_true')
    args = parser.parse_args()
    if not os.getenv('SWAYSOCK'):
        parser.error('This native helper targets Sway. Use the web app on other platforms.')
    try:
        app = Companion(Client(args.url), args.observe_window_context)
    except (ImportError, ValueError) as error:
        parser.error(str(error) + ' Use system Python with GTK3 / PyGObject / GtkLayerShell.')
    app.run()


if __name__ == '__main__':
    main()
