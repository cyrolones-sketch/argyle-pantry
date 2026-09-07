const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const ROOT = __dirname;
try { process.loadEnvFile(path.join(ROOT, ".env")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const PORT = Number(process.env.PORT || 4181);
const HOST = process.env.HOST || "127.0.0.1";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain" };
const worker = import(pathToFileURL(path.join(ROOT, "_worker.js")).href);
const assets = {
  async fetch(request) {
    const url = new URL(request.url);
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return new Response("Bad request", { status: 400 }); }
    if (pathname === "/") pathname = "/index.html";
    if (!path.extname(pathname)) pathname += ".html";
    const file = path.resolve(ROOT, "." + pathname);
    if (!file.startsWith(ROOT + path.sep)) return new Response("Not found", { status: 404 });
    try {
      const body = await fs.promises.readFile(file);
      return new Response(request.method === "HEAD" ? null : body, { headers: { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" } });
    } catch { return new Response("Not found", { status: 404 }); }
  }
};
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32000) { res.writeHead(413); res.end("Request too large"); return; }
      chunks.push(chunk);
    }
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await (await worker).default.fetch(request, { ...process.env, ASSETS: assets });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("Local server request failed:", error.name);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "The service is temporarily unavailable. Please try again." }));
  }
});
if (require.main === module) server.listen(PORT, HOST, () => console.log(`Argyle Pantry at http://${HOST}:${PORT}`));
module.exports = server;
