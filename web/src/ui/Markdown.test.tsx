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
    const { container } = render(<Markdown text={'```\n<b>x</b>\n**y**\n```'} />);
    expect(container.querySelector('b, strong')).toBeNull();
    expect(container.querySelector('pre.code-block')!.textContent).toBe('<b>x</b>\n**y**');
  });

  it('highlights a tagged fence and keeps its text exact', () => {
    const source = 'def f(x):\n    return "hi"  # done';
    const { container } = render(<Markdown text={'```python\n' + source + '\n```'} />);
    const code = container.querySelector('pre.code-block code.hljs')!;
    expect(code.textContent).toBe(source);
    expect(code.querySelector('.hljs-keyword')!.textContent).toBe('def');
    expect(code.querySelector('.hljs-string')!.textContent).toBe('"hi"');
    expect(code.querySelector('.hljs-comment')!.textContent).toBe('# done');
    expect(container.querySelector('pre')!.getAttribute('data-language')).toBe('python');
  });

  it('never turns hostile code into elements, highlighted or not', () => {
    for (const fence of ['```html', '```python', '```', '```nosuchlang']) {
      const { container } = render(<Markdown text={`${fence}\n<img src=x onerror="window.pwned=1"><script>window.pwned=2</script>\n\`\`\``} />);
      expect(container.querySelector('img, script'), fence).toBeNull();
      expect(container.querySelector('pre')!.textContent, fence).toContain('<img src=x onerror="window.pwned=1">');
      cleanup();
    }
  });

  it('leaves unknown languages and weak guesses as plain code', () => {
    expect(html('```nosuchlang\nlet x = 1\n```')).toBe('<pre class="code-block" data-language="nosuchlang"><code>let x = 1</code></pre>');
    expect(html('```\nremember to buy milk\n```')).toBe('<pre class="code-block"><code>remember to buy milk</code></pre>');
  });

  it('guesses an untagged fence when it is clearly code', () => {
    const { container } = render(<Markdown text={'```\nfrom typing import List\nclass Solution:\n    def f(self, nums: List[int]) -> int:\n        return len(nums)\n```'} />);
    expect(container.querySelector('code.hljs .hljs-keyword')).not.toBeNull();
  });

  it('closes an unterminated fence at the end, and a fence closes an open list', () => {
    expect(html('```\nline')).toBe('<pre class="code-block"><code>line</code></pre>');
    expect(html('- a\n```\nc\n```')).toBe('<ul><li>a</li></ul><pre class="code-block"><code>c</code></pre>');
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
