/* Throwaway benchmark keyboard: zwp_virtual_keyboard_v1 against a PRIVATE headless Sway.
 * stdin lines: "t <text>" types lowercase/digits/space/.,-; "c <letter>" sends Ctrl+letter;
 * "e" Enter; "x" Escape. Prints "ok" after each line. Refuses non-private runtimes. */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mman.h>
#include <time.h>
#include <wayland-client.h>
#include <xkbcommon/xkbcommon.h>

static const struct wl_interface kbd_interface;
static const struct wl_interface *create_types[] = {&wl_seat_interface, &kbd_interface};
static const struct wl_message create_method = {"create_virtual_keyboard", "on", create_types};
static const struct wl_interface manager_interface = {
    "zwp_virtual_keyboard_manager_v1", 1, 1, &create_method, 0, NULL};
static const struct wl_interface *no_types[] = {NULL, NULL, NULL, NULL};
static const struct wl_message kbd_methods[] = {
    {"keymap", "uhu", no_types}, {"key", "uuu", no_types},
    {"modifiers", "uuuu", no_types}, {"destroy", "", no_types}};
static const struct wl_interface kbd_interface = {
    "zwp_virtual_keyboard_v1", 1, 4, kbd_methods, 0, NULL};

static struct wl_proxy *manager;
static struct wl_seat *seat;
static struct wl_display *display;
static struct wl_proxy *kbd;

static void global(void *d, struct wl_registry *r, uint32_t name, const char *iface, uint32_t v) {
    (void)d; (void)v;
    if (!strcmp(iface, manager_interface.name)) manager = wl_registry_bind(r, name, &manager_interface, 1);
    else if (!strcmp(iface, "wl_seat") && !seat) seat = wl_registry_bind(r, name, &wl_seat_interface, 1);
}
static void removed(void *d, struct wl_registry *r, uint32_t n) { (void)d; (void)r; (void)n; }

static uint32_t now_ms(void) {
    struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t);
    return (uint32_t)(t.tv_sec * 1000 + t.tv_nsec / 1000000);
}
static void key(uint32_t code, uint32_t state) {
    wl_proxy_marshal_flags(kbd, 1, NULL, 1, 0, now_ms(), code, state);
}
static void mods(uint32_t depressed) {
    wl_proxy_marshal_flags(kbd, 2, NULL, 1, 0, depressed, 0, 0, 0);
}
static void tap(uint32_t code) {
    key(code, 1); wl_display_flush(display); usleep(12000);
    key(code, 0); wl_display_flush(display); usleep(28000);
}
/* evdev codes, US layout */
static int code_for(char c) {
    static const char *rows[] = {"1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"};
    static const int base[] = {2, 16, 30, 44};
    for (int r = 0; r < 4; r++) { const char *p = strchr(rows[r], c); if (p && c) return base[r] + (int)(p - rows[r]); }
    if (c == ' ') return 57; if (c == '.') return 52; if (c == ',') return 51; if (c == '-') return 12;
    return -1;
}

int main(void) {
    const char *xdg = getenv("XDG_RUNTIME_DIR");
    if (!xdg || !strstr(xdg, "noema-bench-")) return 2;
    display = wl_display_connect(NULL);
    if (!display) return 3;
    struct wl_registry *reg = wl_display_get_registry(display);
    const struct wl_registry_listener l = {global, removed};
    wl_registry_add_listener(reg, &l, NULL);
    if (wl_display_roundtrip(display) < 0 || !manager || !seat) return 4;
    kbd = wl_proxy_marshal_flags(manager, 0, &kbd_interface, 1, 0, seat, NULL);
    struct xkb_context *ctx = xkb_context_new(0);
    struct xkb_rule_names names = {0};
    struct xkb_keymap *km = xkb_keymap_new_from_names(ctx, &names, 0);
    char *s = xkb_keymap_get_as_string(km, XKB_KEYMAP_FORMAT_TEXT_V1);
    size_t n = strlen(s) + 1;
    int fd = memfd_create("keymap", 0);
    if (fd < 0 || write(fd, s, n) != (ssize_t)n) return 5;
    wl_proxy_marshal_flags(kbd, 0, NULL, 1, 0, 1 /* XKB_V1 */, fd, (uint32_t)n);
    if (wl_display_roundtrip(display) < 0) return 6;
    puts("ready"); fflush(stdout);
    char line[4096];
    while (fgets(line, sizeof line, stdin)) {
        line[strcspn(line, "\n")] = 0;
        if (line[0] == 't' && line[1] == ' ') {
            for (char *p = line + 2; *p; p++) { int c = code_for(*p); if (c > 0) tap((uint32_t)c - 0 + 0); }
        } else if (line[0] == 'c' && line[1] == ' ') {
            int c = code_for(line[2]);
            if (c > 0) { key(29, 1); mods(4); tap((uint32_t)c); key(29, 0); mods(0); }
        } else if (line[0] == 'e') tap(28);
        else if (line[0] == 'x') tap(1);
        wl_display_roundtrip(display);
        puts("ok"); fflush(stdout);
    }
    wl_display_disconnect(display);
    return 0;
}
