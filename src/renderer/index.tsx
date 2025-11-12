import * as React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [savedPath, setSavedPath] = React.useState<string | null>(null);
  const [romsRoot, setRomsRoot] = React.useState<string | null>(null);
  const [romsList, setRomsList] = React.useState<Array<{ system: string; game: string }>>([]);
  const [romPreviews, setRomPreviews] = React.useState<Record<string, string>>({});
  const [romSavedPaths, setRomSavedPaths] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<string | null>(null);
  const [activeFilter, setActiveFilter] = React.useState<string>('All');

  // Clean up any blob URLs created for previews when component unmounts
  React.useEffect(() => {
    return () => {
      Object.values(romPreviews).forEach((u) => {
        if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
      });
    };
  }, [romPreviews]);

  async function chooseRomsDirectory() {
    try {
      // @ts-ignore
      const selected = await window.electronAPI.chooseRomsDirectory();
      if (!selected) return;
      console.log('chooseRomsDirectory selected', selected);
      setRomsRoot(selected);
      setStatus(`Selected root: ${selected}`);
      // @ts-ignore
      const list = await window.electronAPI.getRomsList(selected);
      console.log('getRomsList returned', list?.length);
      setRomsList(list || []);
      const systemsCount = Array.from(new Set((list || []).map((l: any) => l.system))).length;
      const gamesCount = (list || []).length;
      // Load any existing thumbnails from output/<system>/<game>.png
      setStatus('Loading existing thumbnails...');
      const previews: Record<string, string> = {};
      const savedPaths: Record<string, string> = {};
      await Promise.all((list || []).map(async (l: any) => {
        try {
          // @ts-ignore
          const t = await window.electronAPI.getThumbnail(l.system, l.game, selected);
          if (t) {
            const k = `${l.system}/${l.game}`;
            previews[k] = t as string;
            savedPaths[k] = `${selected}/${l.system}/Imgs/${l.game}.png`;
          }
        } catch (err) {
          // ignore per-item errors
        }
      }));
      setRomPreviews(previews);
      setRomSavedPaths(savedPaths);
      setStatus(`Found ${gamesCount} games across ${systemsCount} systems — ${Object.keys(previews).length} existing thumbnails`);
    } catch (err) {
      console.error('Failed to choose roms directory', err);
      setStatus('Failed to choose directory');
      alert('Failed to choose directory');
    }
  }

  function makeDropHandlers(system: string, game: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
      },
      onDrop: async (e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        const file = files[0] as File;
        if (!file.type.startsWith('image/')) {
          alert('Please drop an image file');
          return;
        }
        const url = URL.createObjectURL(file);
        // set per-game preview and revoke any previous preview URL for this key
        const key = `${system}/${game}`;
        setRomPreviews((prev) => {
          const prevUrl = prev[key];
          if (prevUrl && prevUrl.startsWith('blob:')) URL.revokeObjectURL(prevUrl);
          return { ...prev, [key]: url };
        });

        try {
          const arrayBuffer = await file.arrayBuffer();
          // @ts-ignore
          const result = await window.electronAPI.saveImageForGame(system, game, arrayBuffer, romsRoot ?? undefined);
          if (result && result.success) {
            setSavedPath(result.path ?? null);
            setRomSavedPaths((prev) => ({ ...prev, [key]: result.path ?? '' }));
            setStatus(`Saved ${system}/${game} -> ${result.path}`);
            // update the list item state (preview is already set)
          } else {
            console.error('Save failed', result?.error);
            alert('Failed to save image: ' + (result?.error || 'unknown'));
          }
        } catch (err) {
          console.error('Failed to send image to main process', err);
          alert('Failed to process dropped image');
        }
      }
    };
  }

  function openGameSearch(game: string) {
    const q = encodeURIComponent(game);
    const url = `https://thegamesdb.net/search.php?name=${q}`;
    try {
      // @ts-ignore
      window.electronAPI.openExternal(url);
    } catch (err) {
      console.error('Failed to open external URL', err);
    }
  }

  function openGoogleBoxartSearch(game: string) {
    const q = encodeURIComponent(`${game} boxart`);
    const url = `https://www.google.com/search?udm=2&q=${q}`;
    try {
      // @ts-ignore
      window.electronAPI.openExternal(url);
    } catch (err) {
      console.error('Failed to open external URL', err);
    }
  }

  function openLaunchBoxSearch(game: string) {
    const q = encodeURIComponent(game);
    const url = `https://gamesdb.launchbox-app.com/games/results/${q}`;
    try {
      // @ts-ignore
      window.electronAPI.openExternal(url);
    } catch (err) {
      console.error('Failed to open external URL', err);
    }
  }

  return (
    <div id="app">
      <div style={{ marginBottom: 12 }}>
        <button onClick={chooseRomsDirectory}>Choose ROMs directory</button>
        {romsRoot && <span style={{ marginLeft: 12 }}>Root: {romsRoot}</span>}
        {status && <div style={{ marginTop: 8, color: '#333', fontSize: 13 }}>{status}</div>}
      </div>

      {/* Group games by system and render a header + grid per system (with filter tabs) */}
      <div>
        {(() => {
          const map: Record<string, Array<{ system: string; game: string }>> = {};
          for (const r of romsList) {
            const sys = r.system || 'Unknown';
            if (!map[sys]) map[sys] = [];
            map[sys].push(r);
          }
          const systems = Object.keys(map).sort();
          const tabs = ['All', ...systems];
          const visibleSystems = activeFilter === 'All' ? systems : systems.filter((s) => s === activeFilter);

          return (
            <div>
              <div className="tabs" style={{ marginBottom: 12 }}>
                {tabs.map((t) => (
                  <button
                    key={t}
                    className={`tab ${activeFilter === t ? 'active' : ''}`}
                    onClick={() => setActiveFilter(t)}
                    style={{ marginRight: 8 }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {visibleSystems.map((system) => (
                <div key={system} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{system}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {map[system].map((r) => {
                      const key = `${r.system}/${r.game}`;
                      const preview = romPreviews[key];
                      const saved = romSavedPaths[key];
                      return (
                        <div key={key} style={{ border: '1px solid #ddd', padding: 8, borderRadius: 6 }}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>{r.game}</div>
                          <div
                            className={'drop-area'}
                            onDragOver={makeDropHandlers(r.system, r.game).onDragOver}
                            onDrop={makeDropHandlers(r.system, r.game).onDrop}
                            style={{ minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            {preview ? (
                              <img src={preview} alt={`preview ${key}`} style={{ maxWidth: '100%', maxHeight: 72, objectFit: 'contain' }} />
                            ) : (
                              <div style={{ fontSize: 12, color: '#333' }}>Drop box art here</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                            <button onClick={() => openGameSearch(r.game)} style={{ fontSize: 12 }}>Search GamesDB</button>
                            <button onClick={() => openGoogleBoxartSearch(r.game)} style={{ fontSize: 12 }}>Search Google</button>
                            <button onClick={() => openLaunchBoxSearch(r.game)} style={{ fontSize: 12 }}>Search LaunchBox</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// Window electronAPI typing for TS
declare global {
  interface Window {
    electronAPI: {
      saveImage: (name: string, buffer: ArrayBuffer) => Promise<{ success: boolean; path?: string; error?: string }>;
      chooseRomsDirectory: () => Promise<string | null>;
      getRomsList: (root: string) => Promise<Array<{ system: string; game: string }>>;
      saveImageForGame: (system: string, game: string, buffer: ArrayBuffer) => Promise<{ success: boolean; path?: string; error?: string }>;
      getThumbnail: (system: string, game: string, root?: string) => Promise<string | null>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
} else {
  console.error('Root element not found');
}
