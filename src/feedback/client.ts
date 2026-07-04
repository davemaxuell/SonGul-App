// FeedbackEngine — the app-side seam that mirrors the server's provider seam.
// LocalEngine keeps the full loop working offline (the APK default);
// RemoteEngine speaks the v1 wire contract to the SonGul feedback gateway.
// `analyzeSmart` picks per the user's settings and degrades gracefully, so
// the moment a real AI sits behind the gateway the app simply starts showing
// its results.
import type { Finding, Settings, Stroke } from '../types';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeResult,
  HealthResponse,
  WireStroke,
} from './contract';
import { applyFindings, checkKorean } from './korean';

export interface EnginePayload {
  text: string;
  strokes?: Stroke[];
  imageDataUrl?: string | null;
}

export interface EngineResult {
  engine: 'local' | 'remote';
  provider: string;
  cached: boolean;
  latencyMs: number;
  findings: Finding[];
  correctedText: string | null;
  /** set when the preferred remote engine failed and local rules answered */
  fallbackReason?: string;
}

const REMOTE_TIMEOUT_MS = 6000;
const POLL_TIMEOUT_MS = 20000;
const MAX_IMAGE_EDGE = 1024;

export function analyzeLocal(payload: EnginePayload): EngineResult {
  const started = performance.now();
  const text = payload.text.normalize('NFC').trim();
  const findings = checkKorean(text);
  return {
    engine: 'local',
    provider: 'on-device-rules',
    cached: false,
    latencyMs: Math.round(performance.now() - started),
    findings,
    correctedText: findings.some((f) => f.end > f.start) ? applyFindings(text, findings) : null,
  };
}

function toWireStrokes(strokes: Stroke[] | undefined): WireStroke[] | undefined {
  if (!strokes?.length) return undefined;
  return strokes.map((s) => ({
    points: s.points.map((pt) => ({ x: pt.x, y: pt.y, p: pt.p, t: pt.t })),
    width: s.width,
    tool: s.tool,
  }));
}

/** keep upload payloads light: contract caps the selection PNG at 1024px */
async function downscaleImage(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('selection image decode failed'));
    img.src = dataUrl;
  });
  const edge = Math.max(img.width, img.height);
  if (edge <= MAX_IMAGE_EDGE) return dataUrl;
  const scale = MAX_IMAGE_EDGE / edge;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = (await res.json()) as T & { error?: string; message?: string };
    if (!res.ok && res.status !== 202) {
      throw new Error(body?.message ?? `gateway ${res.status}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeRemote(serverUrl: string, payload: EnginePayload): Promise<EngineResult> {
  const started = performance.now();
  const base = serverUrl.replace(/\/+$/, '');
  const request: AnalyzeRequest = {
    language: 'ko',
    source: {
      text: payload.text.trim() || undefined,
      strokes: toWireStrokes(payload.strokes),
      imagePng: payload.imageDataUrl ? await downscaleImage(payload.imageDataUrl) : undefined,
    },
    clientRequestId: crypto.randomUUID(),
  };

  let res = await fetchJson<AnalyzeResponse>(
    `${base}/v1/feedback/analyze`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
    REMOTE_TIMEOUT_MS
  );

  // async slow path: a 5–10 s AI answer arrives via polling, never blocking the pen
  const deadline = performance.now() + POLL_TIMEOUT_MS;
  while (res.status === 'pending') {
    if (performance.now() > deadline) throw new Error('gateway analysis timed out');
    await new Promise((r) => setTimeout(r, res.pollAfterMs ?? 750));
    res = await fetchJson<AnalyzeResponse>(
      `${base}/v1/feedback/analysis/${res.analysisId}`,
      { method: 'GET' },
      REMOTE_TIMEOUT_MS
    );
  }

  if (res.status !== 'done' || !res.result) {
    throw new Error(res.error ?? 'gateway analysis failed');
  }
  const result: AnalyzeResult = res.result;
  return {
    engine: 'remote',
    provider: res.provider,
    cached: res.cached,
    latencyMs: Math.round(performance.now() - started),
    findings: result.findings,
    correctedText: result.correctedText,
  };
}

export async function checkGateway(serverUrl: string): Promise<HealthResponse> {
  const base = serverUrl.replace(/\/+$/, '');
  return fetchJson<HealthResponse>(`${base}/v1/health`, { method: 'GET' }, 4000);
}

/** settings-aware entry point used by the feedback panel */
export async function analyzeSmart(settings: Settings, payload: EnginePayload): Promise<EngineResult> {
  const url = settings.serverUrl.trim();
  const wantRemote = settings.aiMode === 'remote' || (settings.aiMode === 'auto' && url !== '');
  if (!wantRemote || !url) return analyzeLocal(payload);
  try {
    return await analyzeRemote(url, payload);
  } catch (err) {
    const local = analyzeLocal(payload);
    return {
      ...local,
      fallbackReason: err instanceof Error ? err.message : 'server unreachable',
    };
  }
}
