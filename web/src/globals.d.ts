// web/src/globals.d.ts
export {};
declare global {
  interface Window {
    ipc?: { postMessage(message: 'noema:close-approved'): void }; // Electron main preload only
    __noemaCheckpointCloseReady?: true;
    __noemaField?: { frames: number; readPixel(x: number, y: number): Promise<[number, number, number, number]> };
  }
  interface WindowEventMap { 'vite:preloadError': Event }
}
