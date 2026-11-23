/**
 * Tiny, safe Markdown renderer for guide previews. Supports ##/### headings, paragraphs, **bold**, *italic*,
 * "- " / "1. " lists and [text](http(s) url) links. Everything else is plain text.
 * Input is parsed into a tree and every text/attribute is HTML-escaped on output, so the result
 * never contains markup the author did not get from the supported syntax.
 */

export type MdInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: MdInline[] }
  | { t: 'em'; c: MdInline[] }
  | { t: 'link'; href: string; c: MdInline[] };

export type MdBlock =
  | { t: 'h2' | 'h3' | 'p'; c: MdInline[] }
  | { t: 'ul' | 'ol'; items: MdInline[][] };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Only absolute http(s) URLs without whitespace, quotes, angle brackets or control characters are linkable. */
export function isSafeUrl(url: string): boolean {
  return /^https?:\/\/[^\s<>"'`\u0000-\u001f]+$/i.test(url);
}

/** Index of the closing single `*` (skipping `**` pairs), or -1. */
function findSingleClose(s: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] !== '*') continue;
    if (s[j + 1] === '*') { j++; continue; }
    return j;
  }
  return -1;
}

export function parseInline(s: string): MdInline[] {
  const out: MdInline[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '[') {
      const m = /^\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(s.slice(i));
      if (m) {
        flush();
        if (isSafeUrl(m[2])) out.push({ t: 'link', href: m[2], c: parseInline(m[1]) });
        else out.push(...parseInline(m[1]));     // unsafe target: keep the label, drop the link
        i += m[0].length;
        continue;
      }
    }
    if (ch === '*' && s[i + 1] === '*') {
      const close = s.indexOf('**', i + 2);
      if (close > i + 2) {
        flush();
        out.push({ t: 'strong', c: parseInline(s.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    } else if (ch === '*' && s[i + 1] !== undefined && !/\s/.test(s[i + 1])) {
      const close = findSingleClose(s, i + 1);
      if (close > i + 1) {
        flush();
        out.push({ t: 'em', c: parseInline(s.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { t: 'ul' | 'ol'; items: MdInline[][] } | null = null;
  const endPara = () => { if (para.length) { blocks.push({ t: 'p', c: parseInline(para.join(' ')) }); para = []; } };
  const endList = () => { if (list) { blocks.push(list); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { endPara(); endList(); continue; }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) { endPara(); endList(); blocks.push({ t: h[1].length === 3 ? 'h3' : 'h2', c: parseInline(h[2].trim()) }); continue; }
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ul || ol) {
      endPara();
      const kind = ul ? 'ul' : 'ol';
      if (list && list.t !== kind) endList();
      list ??= { t: kind, items: [] };
      list.items.push(parseInline((ul ?? ol)![1].trim()));
      continue;
    }
    endList();
    para.push(line.trim());
  }
  endPara();
  endList();
  return blocks;
}

function inlineHtml(nodes: MdInline[]): string {
  return nodes.map((n) => {
    switch (n.t) {
      case 'text': return escapeHtml(n.v);
      case 'strong': return `<strong>${inlineHtml(n.c)}</strong>`;
      case 'em': return `<em>${inlineHtml(n.c)}</em>`;
      case 'link': return `<a href="${escapeHtml(n.href)}" target="_blank" rel="noopener noreferrer nofollow">${inlineHtml(n.c)}</a>`;
    }
  }).join('');
}

/** Markdown source -> escaped HTML string (safe to bind with [innerHTML]; Angular sanitizes it again). */
export function renderMarkdown(src: string): string {
  return parseMarkdown(src).map((b) => {
    if ('items' in b) return `<${b.t}>${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join('')}</${b.t}>`;
    return `<${b.t}>${inlineHtml(b.c)}</${b.t}>`;
  }).join('\n');
}
