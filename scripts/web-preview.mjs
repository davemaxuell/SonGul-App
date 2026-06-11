#!/usr/bin/env node
// Web preview for the SonGul tablet app on a headless / remote host.
//
// Why this exists:
//   expo-sqlite's web engine uses SharedArrayBuffer + Atomics to expose its
//   synchronous API (openDatabaseSync/execSync/getAllSync). Browsers only grant
//   SharedArrayBuffer to a *cross-origin-isolated* page, which needs COOP + COEP
//   headers ON THE HTML DOCUMENT. Expo's dev server sends those headers on
//   Metro-served assets (via metro.config.js) but NOT on the document itself,
//   so without this the app white-screens on web.
//
//   This script runs a dependency-free reverse proxy that injects the isolation
//   headers on every response, and forwards WebSocket upgrades so Fast Refresh
//   keeps working. It will start Expo for you, or front an Expo already running
//   on EXPO_PORT.
//
// Usage:   npm run web:preview        (open the PROXY_PORT URL below in Chrome)
// Env:     PORT (proxy, default 19006)   EXPO_PORT (default 8081)

import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const HOST = '127.0.0.1';
const EXPO_PORT = Number(process.env.EXPO_PORT || 8081);
const PROXY_PORT = Number(process.env.PORT || 19006);

const ISOLATION_HEADERS = {
  'cross-origin-opener-policy': 'same-origin',
  // `credentialless` matches Expo's documented value and lets cross-origin
  // resources (e.g. remote images) load without needing CORP. Chrome/Edge only.
  'cross-origin-embedder-policy': 'credentialless',
};

const probe = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, HOST);
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

const waitForPort = async (port, timeoutMs = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probe(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for Expo on :${port}`);
};

let expo = null;

async function main() {
  if (await probe(EXPO_PORT)) {
    console.log(`[web-preview] Reusing Expo already running on :${EXPO_PORT}`);
  } else {
    console.log(`[web-preview] Starting Expo web on :${EXPO_PORT} (no-watch mode) ...`);
    // CI=1 puts Metro in no-watch mode. This box's inotify watch limit (65536,
    // shared across all users) is exhausted, so the default file watcher crashes
    // with ENOSPC while recursively watching node_modules (e.g. expo-image's iOS
    // prebuilt xcframeworks). No-watch trades away hot reload — reload manually
    // after edits — for a dev server that stays up.
    expo = spawn('npx', ['expo', 'start', '--web', '--port', String(EXPO_PORT)], {
      stdio: 'inherit',
      env: { ...process.env, CI: '1' },
    });
    expo.on('exit', (code) => {
      console.log(`[web-preview] Expo exited (${code}); shutting down proxy.`);
      process.exit(code ?? 0);
    });
    await waitForPort(EXPO_PORT);
  }

  const proxy = http.createServer((req, res) => {
    // Rewrite host AND origin: the Expo dev server's DNS-rebinding protection
    // 500s any request whose Origin it doesn't recognize. Browsers attach the
    // page origin to CORS-mode fetches (fonts, wasm), so when the preview is
    // reached through a tunnel or LAN address those all get rejected unless we
    // present a local origin upstream — and an ACAO:* downstream so the
    // browser accepts the (uncredentialed, COEP-credentialless) response.
    const headers = { ...req.headers, host: `${HOST}:${EXPO_PORT}` };
    if (headers.origin) headers.origin = `http://${HOST}:${EXPO_PORT}`;
    const upstream = http.request(
      { host: HOST, port: EXPO_PORT, method: req.method, path: req.url, headers },
      (up) => {
        res.writeHead(up.statusCode || 502, {
          ...up.headers,
          ...ISOLATION_HEADERS,
          'access-control-allow-origin': '*',
        });
        up.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`web-preview proxy error: ${err.message}`);
    });
    req.pipe(upstream);
  });

  // Forward WebSocket upgrades (Metro Fast Refresh) by piping raw sockets.
  proxy.on('upgrade', (req, clientSocket, head) => {
    const upstream = net.connect(EXPO_PORT, HOST, () => {
      const wsHeaders = { ...req.headers, host: `${HOST}:${EXPO_PORT}` };
      if (wsHeaders.origin) wsHeaders.origin = `http://${HOST}:${EXPO_PORT}`;
      const lines = Object.entries(wsHeaders).map(
        ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`,
      );
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
      if (head?.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });

  proxy.listen(PROXY_PORT, () => {
    console.log(
      `\n[web-preview] Cross-origin-isolated preview ready:\n` +
        `              http://localhost:${PROXY_PORT}   (forward this port, open in Chrome)\n`,
    );
  });

  const shutdown = () => {
    proxy.close();
    if (expo && !expo.killed) expo.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`[web-preview] ${err.message}`);
  process.exit(1);
});
