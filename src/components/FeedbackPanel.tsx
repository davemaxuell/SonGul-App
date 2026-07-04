// The SonGul feedback panel — the "teacher's red pen" layer.
// Pipeline: lasso selection → (pluggable) recognition → editable text →
// feedback engine (on-device rules today, SonGul AI gateway when configured)
// → findings with explanations → history → practice pages.
import { useEffect, useMemo, useState } from 'react';
import type { BBox, Finding, Notebook, Page, FeedbackResult, Settings, Stroke } from '../types';
import * as db from '../db';
import { uid } from '../ids';
import { applyFindings, FINDING_LABELS } from '../feedback/korean';
import { analyzeSmart, type EngineResult } from '../feedback/client';
import { getProvider, providers } from '../feedback/recognition';

export interface AnalysisRequest {
  imageUrl: string | null;
  bbox: BBox | null;
  strokeCount: number;
  /** the lassoed vector ink — sent to the gateway so a future AI can judge
      handwriting shape, not just text */
  strokes?: Stroke[];
}

interface Props {
  notebook: Notebook;
  page: Page;
  settings: Settings;
  request: AnalysisRequest | null;
  onHighlight: (b: BBox[]) => void;
  onCreatePractice: (sentences: string[]) => void;
  onJumpTo: (pageId: string, bbox: BBox | null) => void;
  onClose: () => void;
}

function severityClass(s: Finding['severity']): string {
  return 'sev-' + s;
}

export default function FeedbackPanel(p: Props) {
  const [tab, setTab] = useState<'check' | 'history' | 'practice'>('check');
  const [providerId, setProviderId] = useState('mock');
  const [text, setText] = useState('');
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [engineMeta, setEngineMeta] = useState<EngineResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [history, setHistory] = useState<FeedbackResult[]>([]);
  const [recognizing, setRecognizing] = useState(false);

  useEffect(() => {
    void refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.notebook.id]);

  useEffect(() => {
    if (!p.request) return;
    setTab('check');
    setFindings(null);
    setText('');
    setRecognizing(true);
    getProvider(providerId)
      .recognize({ strokes: [], language: 'ko' })
      .then((r) => {
        if (r.text) setText(r.text);
      })
      .finally(() => setRecognizing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.request]);

  async function refreshHistory() {
    setHistory(await db.listFeedback(p.notebook.id));
  }

  async function analyze() {
    const trimmed = text.trim();
    if (!trimmed || analyzing) return;
    setAnalyzing(true);
    try {
      const engineResult = await analyzeSmart(p.settings, {
        text: trimmed,
        strokes: p.request?.strokes,
        imageDataUrl: p.request?.imageUrl,
      });
      setFindings(engineResult.findings);
      setEngineMeta(engineResult);
      const record: FeedbackResult = {
        id: uid(),
        notebookId: p.notebook.id,
        pageId: p.page.id,
        createdAt: Date.now(),
        sourceText: trimmed,
        findings: engineResult.findings,
        bbox: p.request?.bbox ?? null,
      };
      await db.addFeedback(record);
      await refreshHistory();
      if (p.request?.bbox) p.onHighlight([p.request.bbox]);
    } finally {
      setAnalyzing(false);
    }
  }

  const corrected = useMemo(
    () => (findings && findings.length > 0 ? applyFindings(text.trim(), findings) : null),
    [findings, text]
  );

  // aggregate recurring mistakes for practice mode
  const recurring = useMemo(() => {
    const counts = new Map<string, { original: string; suggestion: string; type: Finding['type']; n: number }>();
    for (const r of history) {
      for (const f of r.findings) {
        if (f.end <= f.start) continue;
        const key = `${f.original}→${f.suggestion}`;
        const cur = counts.get(key);
        if (cur) cur.n++;
        else counts.set(key, { original: f.original, suggestion: f.suggestion, type: f.type, n: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  }, [history]);

  const practiceSentences = useMemo(() => {
    const out: string[] = [];
    for (const r of history) {
      if (r.findings.some((f) => f.end > f.start)) {
        const s = applyFindings(r.sourceText, r.findings);
        if (!out.includes(s)) out.push(s);
      }
      if (out.length >= 6) break;
    }
    return out;
  }, [history]);

  return (
    <aside className="feedback-panel" aria-label="Korean feedback">
      <div className="panel-head">
        <h2>
          <span className="redpen-mark">교정</span> Korean feedback
        </h2>
        <button className="icon-btn" onClick={p.onClose} aria-label="Close feedback panel">
          ✕
        </button>
      </div>

      <div className="panel-tabs" role="tablist">
        {(
          [
            ['check', '검사 Check'],
            ['history', '기록 History'],
            ['practice', '연습 Practice'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={'panel-tab' + (tab === id ? ' active' : '')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'check' && (
        <div className="panel-body">
          {p.request?.imageUrl ? (
            <div className="selection-preview">
              <img src={p.request.imageUrl} alt="Selected handwriting" />
              <span className="selection-meta">
                {p.request.strokeCount} stroke{p.request.strokeCount === 1 ? '' : 's'} selected
              </span>
            </div>
          ) : (
            <p className="panel-hint">
              Select handwriting with the lasso tool and tap <strong>교정 Check</strong>, or type
              a sentence below to check it directly.
            </p>
          )}

          <label className="field-label" htmlFor="fb-provider">
            Recognition provider
          </label>
          <select
            id="fb-provider"
            className="field"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
          >
            {providers.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.label}
              </option>
            ))}
          </select>
          <p className="panel-note">
            Handwriting recognition is pluggable (ML Kit / MyScript later). The mock provider
            leaves the text below for you to enter or correct.
          </p>

          <label className="field-label" htmlFor="fb-text">
            Text to check
          </label>
          <textarea
            id="fb-text"
            className="field fb-textarea"
            rows={3}
            placeholder={recognizing ? 'Recognizing…' : '예: 한국어를 공부할수있어요'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn btn-primary fb-analyze"
            disabled={!text.trim() || analyzing}
            onClick={() => void analyze()}
          >
            {analyzing ? '분석 중…' : '내 글씨 확인 · Check my writing'}
          </button>

          {engineMeta && findings && (
            <div className="fb-meta">
              <span className={'fb-badge' + (engineMeta.engine === 'local' ? ' offline' : '')}>
                {engineMeta.engine === 'local' ? '📱 on-device' : '☁ ' + engineMeta.provider}
                {' · '}
                {engineMeta.latencyMs}ms
                {engineMeta.cached ? ' · cached' : ''}
              </span>
            </div>
          )}
          {engineMeta?.fallbackReason && (
            <p className="fb-fallback-note">
              서버에 연결하지 못해 기기 내 검사기로 확인했어요. (server unreachable — checked
              on-device instead: {engineMeta.fallbackReason})
            </p>
          )}

          {findings && findings.length === 0 && (
            <div className="fb-clean">잘 썼어요! No issues found by the v0 checkers.</div>
          )}

          {findings && findings.length > 0 && (
            <div className="fb-results">
              {corrected && (
                <div className="fb-corrected">
                  <span className="fb-corrected-label">수정문 Corrected</span>
                  <span className="fb-corrected-text">{corrected}</span>
                </div>
              )}
              {findings.map((f, i) => (
                <div key={i} className={'fb-card ' + severityClass(f.severity)}>
                  <div className="fb-card-head">
                    <span className={'fb-type fb-type-' + f.type}>
                      {FINDING_LABELS[f.type].ko} · {FINDING_LABELS[f.type].en}
                    </span>
                    <span className={'fb-sev ' + severityClass(f.severity)}>{f.severity}</span>
                  </div>
                  <div className="fb-diff">
                    <del>{f.original}</del>
                    <span className="fb-arrow">→</span>
                    <ins>{f.suggestion}</ins>
                  </div>
                  <p className="fb-explain">{f.explanation}</p>
                  <p className="fb-explain-en">{f.explanationEn}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="panel-body">
          {history.length === 0 && (
            <p className="panel-hint">No feedback yet. Check a sentence to start your history.</p>
          )}
          {history.map((r) => (
            <button
              key={r.id}
              className="fb-history-item"
              onClick={() => p.onJumpTo(r.pageId, r.bbox ?? null)}
            >
              <span className="fb-history-text">{r.sourceText}</span>
              <span className="fb-history-meta">
                {r.findings.length} finding{r.findings.length === 1 ? '' : 's'} ·{' '}
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === 'practice' && (
        <div className="panel-body">
          <h3 className="panel-subhead">자주 틀리는 것 · Recurring mistakes</h3>
          {recurring.length === 0 && (
            <p className="panel-hint">
              Mistakes you make repeatedly will collect here, ready to practice.
            </p>
          )}
          {recurring.map((m, i) => (
            <div key={i} className="fb-recurring">
              <span className={'fb-type fb-type-' + m.type}>{FINDING_LABELS[m.type].ko}</span>
              <span className="fb-diff-inline">
                <del>{m.original}</del> → <ins>{m.suggestion}</ins>
              </span>
              <span className="fb-count">×{m.n}</span>
            </div>
          ))}
          <button
            className="btn btn-primary fb-analyze"
            disabled={practiceSentences.length === 0}
            onClick={() => p.onCreatePractice(practiceSentences)}
          >
            Create practice page · 연습장 만들기
          </button>
          <p className="panel-note">
            Generates a tracing page from your corrected sentences — trace the gray text, then
            copy it on the lines below.
          </p>
        </div>
      )}
    </aside>
  );
}
