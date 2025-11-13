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
ipcMain.handle('save-image-for-game', async (_, args: { system: string; game: string; buffer: Uint8Array | ArrayBuffer; root: string }) => {
  try {
    const { system, game, buffer, root } = args;
    const inputBuffer = Buffer.from(buffer as any);
    const pngBuffer = await sharp(inputBuffer)
      .resize({ width: 250, height: 250, fit: 'inside' })
      .png()
      .toBuffer();

  const outputDir = path.join(root, system, 'Imgs');
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
ipcMain.handle('get-thumbnail', async (_, args: { system: string; game: string; root: string }) => {
  try {
    const { system, game, root } = args;
    const p = path.join(root, system, 'Imgs', `${game}.png`);
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
