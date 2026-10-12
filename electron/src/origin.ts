// Ports of desktop/src/lib.rs:31-56. Node's WHATWG URL parser matches the Rust url crate used there.

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function sameOrigin(server: string, target: string): boolean {
  const base = parse(server);
  const url = parse(target);
  return base !== null && url !== null && url.username === '' && url.password === ''
    && base.origin !== 'null' && url.origin === base.origin;
}

export function downloadAllowed(server: string, target: string): boolean {
  return sameOrigin(server, target) || (target.startsWith('blob:') && sameOrigin(server, target.slice('blob:'.length)));
}

export function externalLinkAllowed(target: string): boolean {
  const url = parse(target);
  return url !== null && (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
    && url.username === '' && url.password === '';
}
