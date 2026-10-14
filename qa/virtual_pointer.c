/* Private QA pointer capability, not an application dependency.
 * Wire definitions: wlr-virtual-pointer-unstable-v1 (version 1),
 * https://github.com/swaywm/wlr-protocols/blob/master/unstable/wlr-virtual-pointer-unstable-v1.xml
 * No pointer requests are sent here; the guarded probe uses Sway IPC.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wayland-client.h>

static const struct wl_interface pointer_interface = {
    "zwlr_virtual_pointer_v1", 1, 0, NULL, 0, NULL
};
static const struct wl_interface *create_types[] = {
    &wl_seat_interface, &pointer_interface
};
static const struct wl_message create_method = {
    "create_virtual_pointer", "?on", create_types
};
static const struct wl_interface manager_interface = {
    "zwlr_virtual_pointer_manager_v1", 1, 1, &create_method, 0, NULL
};
static struct wl_proxy *manager;

static void global(void *data, struct wl_registry *registry, uint32_t name,
                   const char *interface, uint32_t version) {
    (void)data; (void)version;
    if (strcmp(interface, manager_interface.name) == 0)
        manager = wl_registry_bind(registry, name, &manager_interface, 1);
}
static void removed(void *data, struct wl_registry *registry, uint32_t name) {
    (void)data; (void)registry; (void)name;
}

int main(void) {
    const char *runtime = getenv("NOEMA_QA_PRIVATE_RUNTIME");
    const char *xdg = getenv("XDG_RUNTIME_DIR");
    const char *wayland = getenv("WAYLAND_DISPLAY");
    if (!runtime || !xdg || strcmp(runtime, xdg) != 0 ||
        strncmp(runtime, "/tmp/noema-sway-qa-", 19) != 0 ||
        !wayland || strncmp(wayland, "wayland-", 8) != 0 ||
        strchr(wayland, '/')) return 2;
    struct wl_display *display = wl_display_connect(NULL);
    if (!display) return 3;
    struct wl_registry *registry = wl_display_get_registry(display);
    const struct wl_registry_listener listener = {global, removed};
    wl_registry_add_listener(registry, &listener, NULL);
    if (wl_display_roundtrip(display) < 0 || !manager) return 4;
    struct wl_proxy *pointer = wl_proxy_marshal_flags(manager, 0,
        &pointer_interface, 1, 0, NULL, NULL);
    if (!pointer || wl_display_roundtrip(display) < 0) return 5;
    puts("ready");
    fflush(stdout);
    /* The parent holds stdin open for the entire guarded test. */
    (void)getchar();
    wl_display_disconnect(display);
    return 0;
}
