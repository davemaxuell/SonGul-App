import type { Settings } from '../types';
import Modal from './Modal';
import TemplatePicker from './TemplatePicker';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export default function SettingsDialog({ settings, onChange, onClose }: Props) {
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

      <p className="settings-hint about-line">
        SonGul Note v0.1 — local-first. All notes are stored on this device (IndexedDB). Use
        Export → .songul for backups.
      </p>
    </Modal>
  );
}
