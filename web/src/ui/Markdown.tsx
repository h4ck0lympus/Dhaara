import type { JSX, ReactNode } from 'react';

const HEADINGS = ['h1', 'h2', 'h3'] as const;

// app.js:236 — `code` and **bold** only. shortcut: markers nested inside each other render as text; upgrade if notes need nesting.
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(match[1] !== undefined ? <code key={parts.length}>{match[1]}</code> : <strong key={parts.length}>{match[2]}</strong>);
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }): JSX.Element {
  const blocks: ReactNode[] = [];
  let code: string[] | null = null;
  let items: ReactNode[] | null = null;
  const closeList = () => {
    if (items) blocks.push(<ul key={blocks.length}>{items}</ul>);
    items = null;
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      closeList();
      if (code) blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);
      code = code ? null : [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const item = line.match(/^\s*[-*] (.*)/);
    if (item) {
      items = items ?? [];
      items.push(<li key={items.length}>{inline(item[1])}</li>);
      continue;
    }
    closeList();
    const heading = line.match(/^(#{1,3}) (.*)/);
    if (heading) {
      const Tag = HEADINGS[heading[1].length - 1];
      blocks.push(<Tag key={blocks.length}>{inline(heading[2])}</Tag>);
    } else if (line.trim()) {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  closeList();
  if (code) blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);
  return <>{blocks}</>;
}
