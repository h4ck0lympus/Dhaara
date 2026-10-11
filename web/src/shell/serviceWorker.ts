// The watch build (`npm run watch`, mode development) emits sw.js without its precache header, so it is never registered there.
export function registerServiceWorker(): void {
  if (import.meta.env.DEV || import.meta.env.MODE === 'development' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
