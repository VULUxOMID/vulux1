import http from "node:http";
import httpProxy from "http-proxy";

const BACKEND_PORT = 3000;
const EXPO_PORT = 8081;
const PROXY_PORT = 5000;

const proxy = httpProxy.createProxyServer({ ws: true });

proxy.on("error", (err, req, res) => {
  console.error("[proxy] error:", err.message);
  if (res && !res.headersSent && res.writeHead) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Proxy error: target not ready");
  }
});

function isBackendRequest(url) {
  return url.startsWith("/api/") || url === "/api" ||
    url.startsWith("/webhooks/") || url === "/health" ||
    url.startsWith("/health") || url.startsWith("/metrics/") ||
    url === "/realtime";
}

function rewriteApiPath(url) {
  if (url.startsWith("/api/")) return url.slice(4);
  if (url === "/api") return "/";
  return url;
}

const server = http.createServer((req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  if (isBackendRequest(req.url)) {
    req.url = rewriteApiPath(req.url);
    proxy.web(req, res, { target: `http://localhost:${BACKEND_PORT}` });
  } else {
    proxy.web(req, res, { target: `http://localhost:${EXPO_PORT}` });
  }
});

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/realtime" || isBackendRequest(req.url)) {
    req.url = rewriteApiPath(req.url);
    proxy.ws(req, socket, head, { target: `http://localhost:${BACKEND_PORT}` });
  } else {
    proxy.ws(req, socket, head, { target: `http://localhost:${EXPO_PORT}` });
  }
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`[proxy] listening on 0.0.0.0:${PROXY_PORT}`);
  console.log(`[proxy] backend -> localhost:${BACKEND_PORT}`);
  console.log(`[proxy] expo web -> localhost:${EXPO_PORT}`);
});
