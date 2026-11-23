// Local dev server: ONE origin, exactly like production on Vercel.
//   /api/*    → .NET API      (default http://127.0.0.1:5080)
//   /admin/*  → Angular dev   (default http://127.0.0.1:4200, started with `npm start` in /admin)
//   /*        → static storefront from /web
// Same origin means cookies (gd_auth, gd_csrf), SameSite=Strict and relative /api URLs
// behave as they will in production.
//
//   node tools/dev-server.mjs            → http://127.0.0.1:8080
//   PORT=8081 API=http://127.0.0.1:5081 node tools/dev-server.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const PORT = Number(process.env.PORT || 8080);
const API = new URL(process.env.API || "http://127.0.0.1:5080");
const ADMIN = new URL(process.env.ADMIN || "http://127.0.0.1:4200");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm", ".txt": "text/plain", ".xml": "application/xml",
};

function proxy(req, res, target) {
  const opts = {
    hostname: target.hostname, port: target.port, method: req.method, path: req.url,
    headers: { ...req.headers, host: target.host, "x-forwarded-proto": "https", "x-forwarded-for": req.socket.remoteAddress || "" },
  };
  const up = http.request(opts, (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
  up.on("error", () => {
    res.writeHead(502, { "content-type": "application/problem+json" });
    res.end(JSON.stringify({ title: `Dev proxy: ${target.origin} is not running`, status: 502 }));
  });
  req.pipe(up);
}

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      const nf = path.join(root, "404.html");
      res.writeHead(404, { "content-type": TYPES[".html"] });
      fs.createReadStream(nf).on("error", () => res.end("Not found")).pipe(res);
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith("/api/") || req.url === "/api") return proxy(req, res, API);
  if (req.url === "/admin" || req.url.startsWith("/admin/")) return proxy(req, res, ADMIN);
  return serveStatic(req, res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Gear Doctor dev: http://127.0.0.1:${PORT}  (api → ${API.origin}, admin → ${ADMIN.origin})`);
});
