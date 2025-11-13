import * as React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [savedPath, setSavedPath] = React.useState<string | null>(null);
  const [romsRoot, setRomsRoot] = React.useState<string | null>(null);
  const [romsList, setRomsList] = React.useState<Array<{ system: string; game: string }>>([]);
  const [systemsList, setSystemsList] = React.useState<string[]>([]);
  const [romPreviews, setRomPreviews] = React.useState<Record<string, string>>({});
  const [romSavedPaths, setRomSavedPaths] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<string | null>(null);
  const [activeFilter, setActiveFilter] = React.useState<string>('All');
  const [showMissingThumbnails, setShowMissingThumbnails] = React.useState<boolean>(false);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [dragHoverSystem, setDragHoverSystem] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | null>(null);
  const dragCountersRef = React.useRef<Record<string, number>>({});
  const [uploadedKey, setUploadedKey] = React.useState<string | null>(null);
  const uploadedTimerRef = React.useRef<number | null>(null);

  function fuzzyMatch(text: string, pattern: string) {
    // sequential fuzzy match: ensure all characters in `pattern` appear in `text` in order
    const t = (text || '').toLowerCase();
    const p = (pattern || '').toLowerCase();
    if (!p) return true;
    let ti = 0;
    let pi = 0;
    while (ti < t.length && pi < p.length) {
      if (t[ti] === p[pi]) pi++;
      ti++;
    }
    return pi === p.length;
  }

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
      const res = await window.electronAPI.getRomsList(selected);
      // res should now be { systems: string[], games: Array<{system, game}> }
      console.log('getRomsList returned', res?.games?.length ?? 0);
      const gamesList = (res && res.games) ? res.games : [];
      const systems = (res && res.systems) ? res.systems : Array.from(new Set(gamesList.map((l: any) => l.system)));
      setRomsList(gamesList || []);
      setSystemsList(systems || []);
      const systemsCount = systems.length;
      const gamesCount = gamesList.length;
      // Load any existing thumbnails from output/<system>/<game>.png
      setStatus('Loading existing thumbnails...');
      const previews: Record<string, string> = {};
      const savedPaths: Record<string, string> = {};
      await Promise.all((gamesList || []).map(async (l: any) => {
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

  function makeSystemDropHandlers(system: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
      },
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        const cur = dragCountersRef.current[system] ?? 0;
        dragCountersRef.current[system] = cur + 1;
        setDragHoverSystem(system);
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        const cur = dragCountersRef.current[system] ?? 0;
        const next = Math.max(0, cur - 1);
        dragCountersRef.current[system] = next;
        if (next === 0) setDragHoverSystem((curS) => (curS === system ? null : curS));
      },
      onDrop: async (e: React.DragEvent) => {
        e.preventDefault();
        setDragHoverSystem((cur) => (cur === system ? null : cur));
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        const file = files[0] as File;

        // sanitize filename: strip content inside (), [], {}
        const sanitize = (name: string) => {
          const lastDot = name.lastIndexOf('.');
          const ext = lastDot >= 0 ? name.slice(lastDot) : '';
          let base = lastDot >= 0 ? name.slice(0, lastDot) : name;
          // remove bracketed content
          base = base.replace(/\[[^\]]*\]|\([^\)]*\)|\{[^\}]*\}/g, '');
          base = base.replace(/\s+/g, ' ').trim();
          return base + ext;
        };

        const sanitizedFilename = sanitize(file.name);
        // compute game name used in UI (base without extension)
        const lastDot = sanitizedFilename.lastIndexOf('.');
        const gameName = lastDot >= 0 ? sanitizedFilename.slice(0, lastDot) : sanitizedFilename;

        try {
          const arrayBuffer = await file.arrayBuffer();
          // @ts-ignore
          const result = await window.electronAPI.saveRomForSystem(system, sanitizedFilename, arrayBuffer, romsRoot ?? undefined);
          if (result && result.success) {
            const finalFilename = result.filename ?? sanitizedFilename;
            const lastDot2 = finalFilename.lastIndexOf('.');
            const finalGameName = lastDot2 >= 0 ? finalFilename.slice(0, lastDot2) : finalFilename;
            setStatus(`Saved ROM ${finalFilename} -> ${result.path}`);
            // add to romsList so it appears in UI (avoid duplicates) — add at beginning
            setRomsList((prev) => {
              const exists = prev.some((p) => p.system === system && p.game === finalGameName);
              if (exists) return prev;
              return [{ system, game: finalGameName }, ...prev];
            });
            const newKey = `${system}/${finalGameName}`;
            // set uploaded key for animation
            if (uploadedTimerRef.current) {
              window.clearTimeout(uploadedTimerRef.current);
              uploadedTimerRef.current = null;
            }
            setUploadedKey(newKey);
            uploadedTimerRef.current = window.setTimeout(() => {
              setUploadedKey(null);
              uploadedTimerRef.current = null;
            }, 1800);
            // try to load an existing thumbnail for it (if already present)
            try {
              // @ts-ignore
              const t = await window.electronAPI.getThumbnail(system, finalGameName, romsRoot ?? undefined);
              if (t) {
                const key = `${system}/${finalGameName}`;
                setRomPreviews((prev) => ({ ...prev, [key]: t as string }));
              }
            } catch (err) {
              // ignore
            }
            // show a toast to indicate success
            showToast(`Uploaded ${finalFilename}`);
          } else {
            console.error('Save ROM failed', result?.error);
            alert('Failed to save ROM: ' + (result?.error || 'unknown'));
          }
        } catch (err) {
          console.error('Failed to save dropped ROM', err);
          alert('Failed to process dropped ROM');
        }
      }
    };
  }

  function showToast(msg: string) {
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToast(msg);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3000);
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
      {toast ? (
        <div style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(0,0,0,0.78)', color: '#fff', padding: '8px 12px', borderRadius: 8, zIndex: 9999, boxShadow: '0 6px 20px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      ) : null}
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
          // Ensure systems that exist on disk but have no games are included
          for (const s of systemsList) {
            if (!map[s]) map[s] = [];
          }
          const systems = Object.keys(map).sort();
          // Only show the "All" tab when there is at least one system
          const tabs = systems.length > 0 ? ['All', ...systems] : systems;
          const visibleSystems = activeFilter === 'All' ? systems : systems.filter((s) => s === activeFilter);

          return (
            <div>
              <div style={{ marginBottom: 12 }}>
                <div className="tabs">
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
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  { romsRoot ? (
                    <div style={{ fontSize: 16 }}>🔍</div>
                  ) : null }
                  { romsRoot ? (
                    <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={romsRoot ? "Filter games" : "Choose a directory to enable filtering"}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc' }}
                    disabled={!romsRoot}
                    />
                  ) : null }
                  {romsRoot && searchQuery ? (
                    <button
                      onClick={() => setSearchQuery('')}
                      title="Clear search"
                      style={{ marginLeft: 4, padding: '4px 8px', fontSize: 14, cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                {romsRoot ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={showMissingThumbnails}
                      onChange={(e) => setShowMissingThumbnails(e.target.checked)}
                    />
                    <span style={{ fontSize: 13 }}>Show Missing Thumbnails</span>
                  </label>
                ) : null}
              </div>

              {visibleSystems.map((system) => {
                // apply the "missing thumbnail" filter and fuzzy search per-system
                const visibleGames = map[system].filter((r) => {
                  const key = `${r.system}/${r.game}`;
                  const hasPreview = !!romPreviews[key];
                  // exclude if we're showing only missing thumbnails and this one has a preview
                  if (showMissingThumbnails && hasPreview) return false;
                  // apply fuzzy search (if any query provided)
                  if (searchQuery && !fuzzyMatch(r.game, searchQuery)) return false;
                  return true;
                });

                if (visibleGames.length === 0) return null;

                return (
                  <div key={system} style={{ marginBottom: 18 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        margin: '8px 0',
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: dragHoverSystem === system ? '2px dashed #2a7' : '1px dashed transparent',
                        background: dragHoverSystem === system ? 'rgba(42,122,80,0.06)' : 'transparent',
                        transition: 'background 120ms, border 120ms'
                      }}
                      onDragOver={makeSystemDropHandlers(system).onDragOver}
                      onDragEnter={makeSystemDropHandlers(system).onDragEnter}
                      onDragLeave={makeSystemDropHandlers(system).onDragLeave}
                      onDrop={makeSystemDropHandlers(system).onDrop}
                    >
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{system}</div>
                      <div style={{ fontSize: 13, color: '#666', padding: '6px 10px', borderRadius: 6 }}>
                        Drop ROM to upload
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                      {visibleGames.map((r) => {
                        const key = `${r.system}/${r.game}`;
                        const preview = romPreviews[key];
                        const saved = romSavedPaths[key];
                        return (
                                            <div
                                              key={key}
                                              style={{
                                                border: '1px solid #ddd',
                                                padding: 8,
                                                borderRadius: 6,
                                                transition: 'transform 180ms ease, box-shadow 220ms ease, border-color 180ms ease',
                                                transform: uploadedKey === key ? 'scale(1.03)' : undefined,
                                                boxShadow: uploadedKey === key ? '0 8px 24px rgba(42,122,80,0.14)' : undefined,
                                                borderColor: uploadedKey === key ? '#2a7a50' : undefined
                                              }}
                                            >
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
                );
              })}
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
      getRomsList: (root: string) => Promise<{ systems: string[]; games: Array<{ system: string; game: string }> }>;
      saveImageForGame: (system: string, game: string, buffer: ArrayBuffer) => Promise<{ success: boolean; path?: string; error?: string }>;
      getThumbnail: (system: string, game: string, root?: string) => Promise<string | null>;
      saveRomForSystem: (system: string, filename: string, buffer: ArrayBuffer, root?: string) => Promise<{ success: boolean; path?: string; filename?: string; error?: string }>;
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
