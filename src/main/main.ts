import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const indexPath = path.join(__dirname, 'index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// Open a directory picker and return the selected path (or null)
ipcMain.handle('choose-roms-dir', async () => {
  try {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) return null;
    console.log('choose-roms-dir: selected', res.filePaths[0]);
    return res.filePaths[0];
  } catch (err: any) {
    console.error('Failed to choose roms dir', err);
    return null;
  }
});

// Return parsed systems definitions from src/resources/systems.csv
ipcMain.handle('get-systems-defs', async () => {
  try {
    // try several plausible locations for the CSV in dev and packaged app
    const candidates = [
      path.join(__dirname, '..', 'src', 'resources', 'systems.csv'),
      path.join(__dirname, '..', 'resources', 'systems.csv'),
      path.join(process.cwd(), 'src', 'resources', 'systems.csv')
    ];
    let csvPath: string | null = null;
    for (const c of candidates) {
      try {
        await fs.access(c);
        csvPath = c;
        break;
      } catch (_) {
        // continue
      }
    }
    if (!csvPath) {
      console.error('systems.csv not found in expected locations', candidates);
      return { success: false, items: [] };
    }
    const raw = (await fs.readFile(csvPath)).toString('utf8');
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    // header first line may contain column names
    const items: Array<{ systemName: string; folderNames: string[]; extensions: string[] }> = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('|').map((c) => c.trim());
      if (cols.length < 2) continue;
      const systemName = cols[0];
      const folderRaw = cols[1] || '';
      const folderNames = folderRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0 && s.toLowerCase() !== '*(none)*' && s.toLowerCase() !== '(none)');
      const extsRaw = cols[2] || '';
      const extensions = extsRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0 && s.toLowerCase() !== '*(none)*' && s.toLowerCase() !== '(none)');
      if (folderNames.length === 0) {
        // still include the system but with empty folderNames
        items.push({ systemName, folderNames: [], extensions });
      } else {
        items.push({ systemName, folderNames, extensions });
      }
    }
    return { success: true, items };
  } catch (err: any) {
    console.error('get-systems-defs error', err);
    return { success: false, items: [] };
  }
});

// Create an empty system directory under the roms root
ipcMain.handle('create-system-dir', async (_, args: { system: string; root: string }) => {
  try {
    const { system, root } = args;
    if (!root) return { success: false, error: 'No root provided' };
    const p = path.join(root, system);
    try {
      await fs.mkdir(p, { recursive: true });
      console.log(`create-system-dir: created ${p}`);
      return { success: true, path: p };
    } catch (err: any) {
      console.error('create-system-dir: mkdir failed', err);
      return { success: false, error: String(err) };
    }
  } catch (err: any) {
    console.error('create-system-dir error', err);
    return { success: false, error: String(err) };
  }
});

// Given a roms root, return list of { system, game } where layout is <root>/<system>/<game>
ipcMain.handle('get-roms-list', async (_, args: { root: string }) => {
  try {
    const root = args.root;
    const systems = await fs.readdir(root, { withFileTypes: true });
    const out: Array<{ system: string; game: string }> = [];
    const systemNames: string[] = [];
    for (const s of systems) {
      if (!s.isDirectory()) continue;
      const systemName = s.name;
      systemNames.push(systemName);
      const systemPath = path.join(root, systemName);
      const games = await fs.readdir(systemPath, { withFileTypes: true });
      for (const g of games) {
        // Ignore hidden files like .DS_Store
        if (g.name.startsWith('.')) continue;
        if (g.isDirectory()) continue;
        if (g.isFile()) {
          // Treat files inside the system folder as ROMs; use filename (no ext) as game name
          const ext = path.extname(g.name).toLowerCase();
          if (ext) {
            const base = path.parse(g.name).name;
            out.push({ system: systemName, game: base });
          }
        }
      }
    }
    const systemsCount = systemNames.length;
    console.log(`get-roms-list: root=${root} systems=${systemsCount} games=${out.length}`);
    // Return both the list of system names and the discovered games so the UI can show empty systems
    return { systems: systemNames, games: out };
  } catch (err: any) {
    console.error('Failed to scan roms list', err);
    return { systems: [], games: [] };
  }
});

// Save image for a specific game to output/<system>/<game>.png
ipcMain.handle('save-image-for-game', async (_, args: { system: string; game: string; buffer: Uint8Array | ArrayBuffer; root: string; thumbnailDir?: string }) => {
  try {
    const { system, game, buffer, root, thumbnailDir } = args;
    const dir = thumbnailDir && thumbnailDir.length > 0 ? thumbnailDir : 'Imgs';
    const inputBuffer = Buffer.from(buffer as any);
    const pngBuffer = await sharp(inputBuffer)
      .resize({ width: 250, height: 250, fit: 'inside' })
      .png()
      .toBuffer();

    const outputDir = path.join(root, system, dir);
    await fs.mkdir(outputDir, { recursive: true });
    const outPath = path.join(outputDir, `${game}.png`);
    await fs.writeFile(outPath, pngBuffer);
    console.log(`save-image-for-game: wrote ${outPath}`);
    return { success: true, path: outPath };
  } catch (err: any) {
    console.error('Failed to save image for game:', err);
    return { success: false, error: String(err) };
  }
});

// Save an uploaded ROM into <root>/<system>/<filename>
ipcMain.handle('save-rom-for-system', async (_, args: { system: string; filename: string; buffer: Uint8Array | ArrayBuffer; root: string }) => {
  try {
    const { system, filename, buffer, root } = args;
    const outDir = path.join(root, system);
    await fs.mkdir(outDir, { recursive: true });
    // Auto-unique the filename if it already exists. e.g. name (1).ext
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let finalFilename = filename;
    let outPath = path.join(outDir, finalFilename);
    let attempt = 1;
    // If file exists, choose a new name
    while (true) {
      try {
        await fs.access(outPath);
        // exists -> generate a new candidate
        finalFilename = `${base} (${attempt})${ext}`;
        outPath = path.join(outDir, finalFilename);
        attempt++;
      } catch (err) {
        // access failed -> file does not exist, we can use outPath
        break;
      }
    }

    const data = Buffer.from(buffer as any);
    await fs.writeFile(outPath, data);
    console.log(`save-rom-for-system: wrote ${outPath}`);
    return { success: true, path: outPath, filename: finalFilename };
  } catch (err: any) {
    console.error('Failed to save ROM for system:', err);
    return { success: false, error: String(err) };
  }
});

// Return an existing thumbnail (output/<system>/<game>.png) as a data URL, or null if not present
ipcMain.handle('get-thumbnail', async (_, args: { system: string; game: string; root: string; thumbnailDir?: string }) => {
  try {
    const { system, game, root, thumbnailDir } = args;
    const dir = thumbnailDir && thumbnailDir.length > 0 ? thumbnailDir : 'Imgs';
    const p = path.join(root, system, dir, `${game}.png`);
    try {
      const data = await fs.readFile(p);
      const base = data.toString('base64');
      return `data:image/png;base64,${base}`;
    } catch (err: any) {
      // File doesn't exist or can't be read
      return null;
    }
  } catch (err: any) {
    console.error('get-thumbnail error', err);
    return null;
  }
});

// Delete a thumbnail file at <root>/<system>/Imgs/<game>.png
ipcMain.handle('delete-thumbnail', async (_, args: { system: string; game: string; root: string; thumbnailDir?: string }) => {
  try {
    const { system, game, root, thumbnailDir } = args;
    const dir = thumbnailDir && thumbnailDir.length > 0 ? thumbnailDir : 'Imgs';
    const p = path.join(root, system, dir, `${game}.png`);
    try {
      await fs.unlink(p);
      console.log(`delete-thumbnail: removed ${p}`);
      return { success: true, path: p };
    } catch (err: any) {
      console.error('delete-thumbnail: failed to unlink', err);
      return { success: false, error: String(err) };
    }
  } catch (err: any) {
    console.error('delete-thumbnail error', err);
    return { success: false, error: String(err) };
  }
});

// Delete ROM file(s) matching the base game name in <root>/<system>
ipcMain.handle('delete-rom', async (_, args: { system: string; game: string; root: string; thumbnailDir?: string }) => {
  try {
    const { system, game, root, thumbnailDir } = args;
    const systemPath = path.join(root, system);
    const dirents = await fs.readdir(systemPath, { withFileTypes: true });
    const deleted: string[] = [];
    for (const d of dirents) {
      if (!d.isFile()) continue;
      if (d.name.startsWith('.')) continue;
      const base = path.parse(d.name).name;
      if (base === game) {
        const p = path.join(systemPath, d.name);
        try {
          await fs.unlink(p);
          deleted.push(d.name);
          console.log(`delete-rom: removed ${p}`);
        } catch (err: any) {
          console.error('delete-rom: failed to unlink', p, err);
        }
      }
    }
    // also try to remove thumbnail
    const dir = thumbnailDir && thumbnailDir.length > 0 ? thumbnailDir : 'Imgs';
    const thumbPath = path.join(root, system, dir, `${game}.png`);
    let thumbDeleted = false;
    try {
      await fs.unlink(thumbPath);
      thumbDeleted = true;
      console.log(`delete-rom: removed thumbnail ${thumbPath}`);
    } catch (err: any) {
      // ignore if not present
    }
    if (deleted.length === 0) {
      return { success: false, error: 'No matching ROM files found' };
    }
    return { success: true, deleted, thumbDeleted };
  } catch (err: any) {
    console.error('delete-rom error', err);
    return { success: false, error: String(err) };
  }
});

// Open a URL in the default OS browser
ipcMain.handle('open-external', async (_, args: { url: string }) => {
  try {
    const { url } = args;
    await shell.openExternal(url);
    return { success: true };
  } catch (err: any) {
    console.error('open-external error', err);
    return { success: false, error: String(err) };
  }
});
