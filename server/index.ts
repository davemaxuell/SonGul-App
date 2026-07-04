// SonGul feedback gateway — zero-dependency Node (≥22.6) HTTP server.
//   npm run server          → http://0.0.0.0:8787 (reachable from tablets on the LAN)
// Endpoints (see src/feedback/contract.ts for shapes):
//   GET  /v1/health
//   POST /v1/feedback/analyze
//   GET  /v1/feedback/analysis/:id
//   GET  /v1/feedback/history?limit=50
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { HealthResponse } from '../src/feedback/contract.ts';
import { PROVIDERS, RequestError, activeProvider, analyze, validate } from './gateway.ts';
import { getAnalysis, loadStore, recentAnalyses } from './store.ts';
import { loadEnv } from './env.ts';

loadEnv();
const PORT = Number(process.env.SONGUL_PORT ?? 8787);
const VERSION = '0.2.0';
const MAX_BODY = 10 * 1024 * 1024; // strokes + selection PNG

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new RequestError(413, 'PAYLOAD_TOO_LARGE', 'body over 10 MB'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null);
      } catch {
        reject(new RequestError(400, 'BAD_JSON', 'invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  let status = 200;
  let provider = '-';
  let cached = false;

  try {
    if (req.method === 'OPTIONS') {
      status = 204;
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && path === '/v1/health') {
      const body: HealthResponse = {
        ok: true,
        service: 'songul-feedback-gateway',
        version: VERSION,
        activeProvider: activeProvider().id,
        providers: PROVIDERS.map((p) => ({
          id: p.id,
          mode: p.mode,
          ready: p.ready(),
          detail: p.detail(),
        })),
      };
      json(res, 200, body);
      return;
    }

    if (req.method === 'POST' && path === '/v1/feedback/analyze') {
      const request = validate(await readBody(req));
      const response = await analyze(request);
      provider = response.provider;
      cached = response.cached;
      status = response.status === 'pending' ? 202 : 200;
      json(res, status, response);
      return;
    }

    const analysisMatch = path.match(/^\/v1\/feedback\/analysis\/([\w-]+)$/);
    if (req.method === 'GET' && analysisMatch) {
      const rec = getAnalysis(analysisMatch[1]);
      if (!rec) throw new RequestError(404, 'NOT_FOUND', 'unknown analysisId');
      provider = rec.response.provider;
      status = rec.response.status === 'pending' ? 202 : 200;
      json(res, status, rec.response);
      return;
    }

    if (req.method === 'GET' && path === '/v1/feedback/history') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
      json(res, 200, {
        analyses: recentAnalyses(limit).map((r) => ({
          analysisId: r.analysisId,
          createdAt: r.createdAt,
          status: r.response.status,
          provider: r.response.provider,
          sourceText: r.response.result?.sourceText ?? null,
          findingCount: r.response.result?.findings.length ?? null,
        })),
      });
      return;
    }

    throw new RequestError(404, 'NOT_FOUND', `no route: ${req.method} ${path}`);
  } catch (err) {
    if (err instanceof RequestError) {
      status = err.status;
      json(res, err.status, { error: err.code, message: err.message });
    } else {
      status = 500;
      console.error('[gateway] unhandled:', err);
      json(res, 500, { error: 'INTERNAL', message: 'unexpected server error' });
    }
  } finally {
    // latency observability (plan.md M11): one line per request
    console.log(
      `[gateway] ${req.method} ${path} ${status} ${Date.now() - started}ms provider=${provider} cached=${cached}`
    );
  }
});

const { analyses } = loadStore();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[gateway] SonGul feedback gateway v${VERSION} on http://0.0.0.0:${PORT}`);
  console.log(`[gateway] ${analyses} stored analyses loaded`);
  for (const p of PROVIDERS) {
    console.log(`[gateway] provider ${p.id} ready=${p.ready()} — ${p.detail()}`);
  }
});
