// Dev-only perf probe. In the console (or via automation) on any page:
//   const p = await import('/dev/perf.js'); await p.report()
// Reports navigation timing, LCP, CLS, request counts/bytes before load and in the first 5 s,
// long tasks, and the top transfer costs. Not loaded by the site.
export async function report(waitMs = 5000) {
  const lcp = [], cls = [], longTasks = [];
  try { new PerformanceObserver((l) => lcp.push(...l.getEntries())).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => cls.push(...l.getEntries())).observe({ type: "layout-shift", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => longTasks.push(...l.getEntries())).observe({ type: "longtask", buffered: true }); } catch {}
  await new Promise((r) => setTimeout(r, waitMs));
  const nav = performance.getEntriesByType("navigation")[0] || {};
  const res = performance.getEntriesByType("resource");
  const loadEnd = nav.loadEventEnd || nav.domComplete || 0;
  const kb = (n) => Math.round(n / 1024);
  const sum = (a) => a.reduce((n, e) => n + (e.transferSize || e.encodedBodySize || 0), 0);
  const beforeLoad = res.filter((e) => e.responseEnd <= loadEnd);
  const byType = {};
  res.forEach((e) => {
    const t = /\/frames\//.test(e.name) ? "frames" : e.initiatorType;
    (byType[t] ||= { n: 0, kb: 0 }).n++;
    byType[t].kb += kb(e.transferSize || e.encodedBodySize || 0);
  });
  const last = lcp[lcp.length - 1];
  return {
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
    load: Math.round(loadEnd),
    lcp: last ? Math.round(last.startTime) : null,
    lcpElement: last?.element ? last.element.tagName + "." + String(last.element.className).slice(0, 40) : last?.url?.split("/").slice(-2).join("/") || null,
    cls: +cls.filter((e) => !e.hadRecentInput).reduce((n, e) => n + e.value, 0).toFixed(4),
    longTasks: longTasks.length,
    longTaskMs: Math.round(longTasks.reduce((n, e) => n + e.duration, 0)),
    requestsBeforeLoad: beforeLoad.length,
    kbBeforeLoad: kb(sum(beforeLoad)),
    requestsFirst5s: res.length,
    kbFirst5s: kb(sum(res)),
    byType,
    firstFrameAt: Math.round(res.find((e) => /frame_0001\./.test(e.name))?.responseEnd || 0),
    fontsAt: Math.round(Math.max(0, ...res.filter((e) => /fonts\.(gstatic|googleapis)/.test(e.name)).map((e) => e.responseEnd))),
  };
}
