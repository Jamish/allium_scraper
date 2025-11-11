import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { promises as fs } from 'fs';
import Jimp from 'jimp';

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
    // Convert whatever transferable was sent into a Node Buffer
    const inputBuffer = Buffer.from(buffer as any);

    const image = await Jimp.read(inputBuffer);
    // Resize while keeping aspect ratio, max 250x250
    image.scaleToFit(250, 250);
    const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);

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
