import { shell, type WebContents } from 'electron';
import { downloadAllowed, externalLinkAllowed, sameOrigin } from './origin.js';

export function installNavigationGuards(contents: WebContents, origin: string): void {
  const sameOriginOnly = (event: { url: string; preventDefault(): void }) => {
    if (!sameOrigin(origin, event.url)) event.preventDefault();
  };
  contents.on('will-navigate', sameOriginOnly);
  contents.on('will-redirect', sameOriginOnly);
  contents.on('will-frame-navigate', sameOriginOnly);
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (externalLinkAllowed(url)) void shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });
  contents.session.on('will-download', (event, item) => {
    if (!downloadAllowed(origin, item.getURL())) event.preventDefault();
  });
}
