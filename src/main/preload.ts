import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
	saveImage: (name: string, buffer: ArrayBuffer) => ipcRenderer.invoke('save-image', { name, buffer }),
	// Open a directory picker and return the selected path (or null)
	chooseRomsDirectory: () => ipcRenderer.invoke('choose-roms-dir'),
	// Given a roms root path, return list of systems and games: { system, game }
	getRomsList: (root: string) => ipcRenderer.invoke('get-roms-list', { root }),
	// Save image buffer as output/<system>/<game>.png
	saveImageForGame: (system: string, game: string, buffer: ArrayBuffer) => ipcRenderer.invoke('save-image-for-game', { system, game, buffer })
});

export {};
