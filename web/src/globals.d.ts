export {};
declare global {
  interface Window {
    ipc?: { postMessage(message: 'dhara:close-approved'): void };
    __dharaCheckpointCloseReady?: true;
    __dharaField?: { frames: number; readPixel(x: number, y: number): Promise<[number, number, number, number]> };
  }
  interface WindowEventMap { 'vite:preloadError': Event }
}
