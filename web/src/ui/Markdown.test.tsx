// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

afterEach(cleanup);

const html = (text: string) => render(<Markdown text={text} />).container.innerHTML;

describe('Markdown', () => {
  it('renders hostile HTML as text, never as elements', () => {
    const { container } = render(<Markdown text={'<img src=x onerror="window.pwned=1">\n<script>window.pwned=2</script>'} />);
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.innerHTML).toBe('<p>&lt;img src=x onerror="window.pwned=1"&gt;</p><p>&lt;script&gt;window.pwned=2&lt;/script&gt;</p>');
  });

  it('renders headings 1–3 and paragraphs, and skips blank lines (app.js:240-243)', () => {
    expect(html('# One\n## Two\n### Three\n#### Four\n\n   \ntext')).toBe('<h1>One</h1><h2>Two</h2><h3>Three</h3><p>#### Four</p><p>text</p>');
  });

  it('groups list items and closes the list at the next other line', () => {
    expect(html('- a\n* b\n  - c\nafter')).toBe('<ul><li>a</li><li>b</li><li>c</li></ul><p>after</p>');
    expect(html('- a\n\n- b')).toBe('<ul><li>a</li></ul><ul><li>b</li></ul>');
  });

  it('keeps fenced code verbatim, including markup-looking text', () => {
    expect(html('```\n<b>x</b>\n**y**\n```')).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt;\n**y**</code></pre>');
  });

  it('closes an unterminated fence at the end, and a fence closes an open list', () => {
    expect(html('```\nline')).toBe('<pre><code>line</code></pre>');
    expect(html('- a\n```\nc\n```')).toBe('<ul><li>a</li></ul><pre><code>c</code></pre>');
  });

  it('renders inline code and bold, leaving unmatched markers as text', () => {
    expect(html('use `ptr` and **care** but **not')).toBe('<p>use <code>ptr</code> and <strong>care</strong> but **not</p>');
    expect(html('# **Hot** path\n- `a`')).toBe('<h1><strong>Hot</strong> path</h1><ul><li><code>a</code></li></ul>');
    expect(html('`<i>x</i>`')).toBe('<p><code>&lt;i&gt;x&lt;/i&gt;</code></p>');
  });

  it('renders nothing for empty text', () => {
    expect(html('')).toBe('');
  });
});
