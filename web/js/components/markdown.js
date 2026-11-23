/**
 * markdown-lite -> safe HTML. Input is escaped first, then a small subset is re-introduced:
 * blank line = <p>, "## " h2, "### " h3, "- " lists, **bold**, *em*, [text](url) (http(s)/relative only).
 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

function safeUrl(u) {
  const url = u.replace(/&amp;/g, "&");
  if (/^https?:\/\//i.test(url)) return { href: u, external: true };
  // relative: no scheme (colon before first slash/?/#), not protocol-relative
  if (!/^\/\//.test(url) && !/^[^/?#]*:/.test(url)) return { href: u, external: false };
  return null;
}

function inline(s) {
  return s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const ok = safeUrl(url);
      if (!ok) return label;
      return `<a href="${ok.href}"${ok.external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>");
}

export function mdLite(src) {
  const text = esc(src).replace(/\r\n?/g, "\n");
  const out = [];
  let para = [];
  let list = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`); list = []; } };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    let m;
    if ((m = /^###\s+(.*)$/.exec(line))) { flushPara(); flushList(); out.push(`<h3>${inline(m[1])}</h3>`); }
    else if ((m = /^##\s+(.*)$/.exec(line))) { flushPara(); flushList(); out.push(`<h2>${inline(m[1])}</h2>`); }
    else if ((m = /^[-*]\s+(.*)$/.exec(line))) { flushPara(); list.push(m[1]); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return out.join("\n");
}

export default mdLite;
