// web/src/globals.d.ts
export {};
declare global {
  interface Window {
    ipc?: { postMessage(message: 'dhara:close-approved'): void }; // Electron main preload only
    __dharaCheckpointCloseReady?: true;
    __dharaField?: { frames: number; readPixel(x: number, y: number): Promise<[number, number, number, number]> };
  }
  interface WindowEventMap { 'vite:preloadError': Event }
}
