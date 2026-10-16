export {};
declare global {
  interface Window {
    ipc?: { postMessage(message: 'dhara:close-approved'): void };
    /** Present only in the Electron companion window. */
    dharaCompanion?: { resize(open: boolean): void; setVisible(visible: boolean): void; openApp(path: string): void };
    __dharaCheckpointCloseReady?: true;
    __dharaField?: { frames: number; readPixel(x: number, y: number): Promise<[number, number, number, number]> };
  }
  interface WindowEventMap { 'vite:preloadError': Event }
}
