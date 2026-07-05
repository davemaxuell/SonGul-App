import { useEffect, useState } from 'react';
import type { BBox, Notebook, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';
import * as db from './db';
import LibraryScreen from './components/LibraryScreen';
import EditorScreen from './components/EditorScreen';
import SettingsDialog from './components/SettingsDialog';
import BenchScreen from './components/BenchScreen';
import { setBlobHooks, startSyncTriggers } from './sync/engine';
import { makeBlobHooks } from './sync/blobs';

type Screen =
  | { name: 'library' }
  | { name: 'editor'; notebook: Notebook; jump?: { pageId: string; bbox: BBox | null } }
  | { name: 'bench' };

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'library' });
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await db.getSetting<Partial<Settings>>('settings');
      setSettings({ ...DEFAULT_SETTINGS, ...saved });
    })();
  }, []);

  useEffect(() => {
    setBlobHooks(makeBlobHooks());
    void db.compactTombstones(30 * 24 * 3600 * 1000);
    return startSyncTriggers();
  }, []);

  if (!settings)
    return (
      <div className="boot-screen">
        <img src="/assets/SonGul-LOGO.png" alt="SonGul" />
      </div>
    );

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void db.setSetting('settings', next);
  };

  return (
    <>
      <div className="sheet-bg" aria-hidden="true" />
      {screen.name === 'library' ? (
        <LibraryScreen
          settings={settings}
          onOpen={(notebook) => setScreen({ name: 'editor', notebook })}
          onOpenAt={(notebook, pageId, bbox) =>
            setScreen({ name: 'editor', notebook, jump: { pageId, bbox } })
          }
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : screen.name === 'editor' ? (
        <EditorScreen
          key={screen.notebook.id}
          notebook={screen.notebook}
          settings={settings}
          initialJump={screen.jump}
          onBack={() => setScreen({ name: 'library' })}
        />
      ) : (
        <BenchScreen onBack={() => setScreen({ name: 'library' })} />
      )}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onChange={updateSettings}
          onOpenBench={() => {
            setSettingsOpen(false);
            setScreen({ name: 'bench' });
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
