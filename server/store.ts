// Append-only JSONL persistence. Analyses double as the content-addressed
// cache: at boot the log is replayed into the in-memory maps. Swappable for
// Postgres when accounts/sync (plan.md M9) arrive — the gateway only touches
// these four functions.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalyzeResponse } from '../src/feedback/contract.ts';

export interface AnalysisRecord {
  analysisId: string;
  contentHash: string;
  createdAt: number;
  response: AnalyzeResponse;
}

const dataDir = join(import.meta.dirname, 'data');
const logPath = join(dataDir, 'analyses.jsonl');

const byId = new Map<string, AnalysisRecord>();
const byHash = new Map<string, AnalysisRecord>();

export function loadStore(): { analyses: number } {
  mkdirSync(dataDir, { recursive: true });
  if (existsSync(logPath)) {
    for (const line of readFileSync(logPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as AnalysisRecord;
        byId.set(rec.analysisId, rec);
        if (rec.response.status === 'done') byHash.set(rec.contentHash, rec);
      } catch {
        // tolerate a torn last line from a crash
      }
    }
  }
  return { analyses: byId.size };
}

export function saveAnalysis(rec: AnalysisRecord): void {
  byId.set(rec.analysisId, rec);
  if (rec.response.status === 'done') byHash.set(rec.contentHash, rec);
  appendFileSync(logPath, JSON.stringify(rec) + '\n', 'utf8');
}

export function getAnalysis(id: string): AnalysisRecord | undefined {
  return byId.get(id);
}

export function getCached(contentHash: string): AnalysisRecord | undefined {
  return byHash.get(contentHash);
}

export function recentAnalyses(limit: number): AnalysisRecord[] {
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}
