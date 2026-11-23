import { isSafeUrl, parseMarkdown, renderMarkdown } from './markdown';

describe('markdown renderer', () => {
  it('escapes raw HTML and script tags', () => {
    const html = renderMarkdown('<script>alert(1)</script> & "quote" <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quote&quot;');
  });
  it('escapes HTML inside headings, bold and link labels', () => {
    const html = renderMarkdown('## <b>hi</b>\n\n**<i>x</i>** [<u>a</u>](https://a.com)');
    expect(html).not.toMatch(/<(b|i|u)>/);
    expect(html).toContain('<h2>&lt;b&gt;hi&lt;/b&gt;</h2>');
  });
  it('only links http(s) URLs', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).toBe('<p>x</p>');
    expect(renderMarkdown('[x](JaVaScRiPt:alert(1))')).not.toContain('href');
    expect(renderMarkdown('[x](data:text/html;base64,AAAA)')).not.toContain('href');
    expect(renderMarkdown('[x](//evil.com)')).not.toContain('href');
    const ok = renderMarkdown('[Shop](https://example.com/a?b=1&c=2)');
    expect(ok).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(ok).toContain('rel="noopener noreferrer nofollow"');
    expect(isSafeUrl('http://a.com')).toBe(true);
    expect(isSafeUrl('https://a.com/"onmouseover="x')).toBe(false);
  });
  it('handles nested emphasis', () => {
    expect(renderMarkdown('**bold *italic* more**')).toBe('<p><strong>bold <em>italic</em> more</strong></p>');
    expect(renderMarkdown('*a **b** c*')).toBe('<p><em>a <strong>b</strong> c</em></p>');
    expect(renderMarkdown('**[link](https://a.com)**')).toContain('<strong><a href="https://a.com"');
  });
  it('leaves unmatched markers as text', () => {
    expect(renderMarkdown('2 * 3 and **open')).toBe('<p>2 * 3 and **open</p>');
  });
  it('builds headings, paragraphs and lists', () => {
    const blocks = parseMarkdown('## Title\n### Sub\nline one\nline two\n\n- a\n- b\n\n1. x\n2. y');
    expect(blocks.map((b) => b.t)).toEqual(['h2', 'h3', 'p', 'ul', 'ol']);
    expect(renderMarkdown('line one\nline two')).toBe('<p>line one line two</p>');
    expect(renderMarkdown('- a\n- **b**')).toBe('<ul><li>a</li><li><strong>b</strong></li></ul>');
  });
  it('returns nothing for blank input', () => {
    expect(renderMarkdown('  \n\n')).toBe('');
  });
});
