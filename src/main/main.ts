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

// IPC handler: save/resizes image buffer sent from renderer and writes PNG to ./output
ipcMain.handle('save-image', async (_, args: { name: string; buffer: Uint8Array | ArrayBuffer }) => {
  try {
    const { name, buffer } = args;
    // Convert transferable into a Node Buffer
    const inputBuffer = Buffer.from(buffer as any);

    // Use sharp which supports webp and many other formats. Resize to fit within 250x250
    const pngBuffer = await sharp(inputBuffer)
      .resize({ width: 250, height: 250, fit: 'inside' })
      .png()
      .toBuffer();

    const outputDir = path.join(process.cwd(), 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const baseName = path.parse(name).name;
    const outPath = path.join(outputDir, `${baseName}.png`);

    await fs.writeFile(outPath, pngBuffer);
    return { success: true, path: outPath };
  } catch (err: any) {
    console.error('Failed to save image:', err);
    return { success: false, error: String(err) };
  }
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
    for (const s of systems) {
      if (!s.isDirectory()) continue;
      const systemName = s.name;
      const systemPath = path.join(root, systemName);
      const games = await fs.readdir(systemPath, { withFileTypes: true });
      for (const g of games) {
        // Ignore hidden files like .DS_Store
        if (g.name.startsWith('.')) continue;
        const full = path.join(systemPath, g.name);
        if (g.isDirectory()) {
          out.push({ system: systemName, game: g.name });
        } else if (g.isFile()) {
          // Treat files inside the system folder as ROMs; use filename (no ext) as game name
          const ext = path.extname(g.name).toLowerCase();
          if (ext) {
            const base = path.parse(g.name).name;
            out.push({ system: systemName, game: base });
          }
        }
      }
    }
    const systemsCount = systems.filter(s => s.isDirectory()).length;
    console.log(`get-roms-list: root=${root} systems=${systemsCount} games=${out.length}`);
    return out;
  } catch (err: any) {
    console.error('Failed to scan roms list', err);
    return [];
  }
});

// Save image for a specific game to output/<system>/<game>.png
ipcMain.handle('save-image-for-game', async (_, args: { system: string; game: string; buffer: Uint8Array | ArrayBuffer }) => {
  try {
    const { system, game, buffer } = args;
    const inputBuffer = Buffer.from(buffer as any);
    const pngBuffer = await sharp(inputBuffer)
      .resize({ width: 250, height: 250, fit: 'inside' })
      .png()
      .toBuffer();

    const outputDir = path.join(process.cwd(), 'output', system);
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

// Return an existing thumbnail (output/<system>/<game>.png) as a data URL, or null if not present
ipcMain.handle('get-thumbnail', async (_, args: { system: string; game: string }) => {
  try {
    const { system, game } = args;
    const p = path.join(process.cwd(), 'output', system, `${game}.png`);
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
