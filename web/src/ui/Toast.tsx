// Phase-1 stand-in so the data layer can report outcomes (contract §4.3–4.4 call toast()). 02-screens-core Task 4
// overwrites this whole file with the ToastHost component; toast(message, options) keeps this signature.
export type ToastOptions = { tone?: 'status' | 'error' };

let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, options: ToastOptions = {}): void {
  document.getElementById('noema-toast')?.remove();
  const node = document.createElement('div');
  node.id = 'noema-toast';
  if (options.tone === 'error') node.setAttribute('role', 'alert');
  else {
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
  }
  node.textContent = message;
  document.body.append(node);
  clearTimeout(timer);
  timer = setTimeout(() => node.remove(), 5500); // app.js:15
}
