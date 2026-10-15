export function registerServiceWorker(): void {
  if (import.meta.env.DEV || import.meta.env.MODE === 'development' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
