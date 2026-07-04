import { useState } from 'react';
import type { AiMode, Settings } from '../types';
import { checkGateway } from '../feedback/client';
import { SongulInk, inkRecognitionAvailable } from '../recognition/songulInk';
import Modal from './Modal';
import TemplatePicker from './TemplatePicker';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onOpenBench?: () => void;
  onClose: () => void;
}

const AI_MODES: { id: AiMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'server when configured, on-device otherwise' },
  { id: 'local', label: 'On-device', hint: 'always use the built-in rule checkers' },
  { id: 'remote', label: 'Server', hint: 'always ask the SonGul gateway' },
];

export default function SettingsDialog({ settings, onChange, onOpenBench, onClose }: Props) {
  const [testState, setTestState] = useState<
    { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok'; detail: string } | { kind: 'fail'; detail: string }
  >({ kind: 'idle' });
  const [modelState, setModelState] = useState<
    { kind: 'idle' } | { kind: 'working' } | { kind: 'ok' } | { kind: 'fail'; detail: string }
  >({ kind: 'idle' });

  async function downloadModel() {
    setModelState({ kind: 'working' });
    try {
      const r = await SongulInk.ensureModel({ language: 'ko' });
      if (r.status === 'downloaded') setModelState({ kind: 'ok' });
      else setModelState({ kind: 'fail', detail: r.message ?? 'download failed' });
    } catch (err) {
      setModelState({ kind: 'fail', detail: err instanceof Error ? err.message : 'failed' });
    }
  }

  async function testConnection() {
    setTestState({ kind: 'testing' });
    try {
      const health = await checkGateway(settings.serverUrl);
      setTestState({
        kind: 'ok',
        detail: `${health.service} v${health.version} · provider: ${health.activeProvider}`,
      });
    } catch (err) {
      setTestState({
        kind: 'fail',
        detail: err instanceof Error ? err.message : 'unreachable',
      });
    }
  }

  return (
    <Modal title="Settings · 설정" onClose={onClose} wide>
      <div className="settings-row">
        <div>
          <strong>Draw with finger</strong>
          <p className="settings-hint">
            Off (recommended for tablets): the stylus writes, fingers pan and pinch-zoom. Turn on
            if you have no stylus.
          </p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.fingerDraws}
            onChange={(e) => onChange({ fingerDraws: e.target.checked })}
          />
          <span className="switch-track" />
        </label>
      </div>

      <div className="settings-row">
        <div>
          <strong>Pressure sensitivity</strong>
          <p className="settings-hint">Vary stroke width with stylus pressure.</p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.pressure}
            onChange={(e) => onChange({ pressure: e.target.checked })}
          />
          <span className="switch-track" />
        </label>
      </div>

      {settings.pressure && (
        <div className="settings-row">
          <div>
            <strong>Pressure response</strong>
            <p className="settings-hint">How strongly pressure changes the line width.</p>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.1}
            value={settings.pressureGain}
            onChange={(e) => onChange({ pressureGain: Number(e.target.value) })}
          />
        </div>
      )}

      <div className="settings-block">
        <strong>Default page template</strong>
        <TemplatePicker
          value={settings.defaultTemplate}
          onChange={(t) => onChange({ defaultTemplate: t })}
        />
      </div>

      <div className="settings-block">
        <strong>SonGul AI · 피드백 엔진</strong>
        <label className="field-label" htmlFor="ai-mode">
          Feedback engine
        </label>
        <select
          id="ai-mode"
          className="field"
          value={settings.aiMode}
          onChange={(e) => onChange({ aiMode: e.target.value as AiMode })}
        >
          {AI_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.hint}
            </option>
          ))}
        </select>
        <label className="field-label" htmlFor="ai-url">
          Feedback server URL
        </label>
        <input
          id="ai-url"
          className="field"
          type="url"
          inputMode="url"
          placeholder="http://192.168.0.10:8787"
          value={settings.serverUrl}
          onChange={(e) => {
            setTestState({ kind: 'idle' });
            onChange({ serverUrl: e.target.value });
          }}
        />
        <div className="ai-test-row">
          <button
            className="btn btn-quiet"
            disabled={!settings.serverUrl.trim() || testState.kind === 'testing'}
            onClick={() => void testConnection()}
          >
            {testState.kind === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          {testState.kind === 'ok' && <span className="ai-status ok">{testState.detail}</span>}
          {testState.kind === 'fail' && <span className="ai-status fail">{testState.detail}</span>}
        </div>
        <p className="settings-hint">
          Run <code>npm run server</code> on your computer and enter its LAN address here. The
          same gateway hosts the real SonGul AI later — the app already sends handwriting
          strokes and images with every check, so nothing else changes. Feedback falls back to
          the on-device checkers whenever the server is unreachable.
        </p>
      </div>

      <div className="settings-block">
        <strong>Handwriting recognition · 손글씨 인식</strong>
        {inkRecognitionAvailable() ? (
          <>
            <div className="ai-test-row">
              <button
                className="btn btn-quiet"
                disabled={modelState.kind === 'working'}
                onClick={() => void downloadModel()}
              >
                {modelState.kind === 'working' ? 'Checking…' : 'Download / check Korean model'}
              </button>
              {modelState.kind === 'ok' && <span className="ai-status ok">Korean model ready</span>}
              {modelState.kind === 'fail' && (
                <span className="ai-status fail">{modelState.detail}</span>
              )}
            </div>
            <p className="settings-hint">
              Recognition runs fully on this device (ML Kit). The Korean model (~20 MB)
              downloads once, then works offline.
            </p>
          </>
        ) : (
          <p className="settings-hint">
            On-device handwriting recognition is available in the SonGul Android app. In the
            browser, type the text to check manually.
          </p>
        )}
        {onOpenBench && (
          <button className="btn btn-quiet" onClick={onOpenBench}>
            Recognition bench · 인식 벤치 열기
          </button>
        )}
      </div>

      <p className="settings-hint about-line">
        SonGul Note v0.2 — local-first. All notes are stored on this device (IndexedDB). Use
        Export → .songul for backups.
      </p>
    </Modal>
  );
}
