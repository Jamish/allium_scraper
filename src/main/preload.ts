import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
	saveImage: (name: string, buffer: ArrayBuffer) => ipcRenderer.invoke('save-image', { name, buffer }),
	// Open a directory picker and return the selected path (or null)
	chooseRomsDirectory: () => ipcRenderer.invoke('choose-roms-dir'),
	// Given a roms root path, return an object with system names and games: { systems: string[], games: Array<{ system, game }> }
	getRomsList: (root: string) => ipcRenderer.invoke('get-roms-list', { root }),
	getSystemsDefs: () => ipcRenderer.invoke('get-systems-defs'),
	// Save image buffer as output/<system>/<game>.png
	saveImageForGame: (system: string, game: string, buffer: ArrayBuffer, root?: string) => ipcRenderer.invoke('save-image-for-game', { system, game, buffer, root }),
	// Save an uploaded ROM into <root>/<system>/<filename>
	saveRomForSystem: (system: string, filename: string, buffer: ArrayBuffer, root?: string) => ipcRenderer.invoke('save-rom-for-system', { system, filename, buffer, root }),
	deleteThumbnail: (system: string, game: string, root?: string) => ipcRenderer.invoke('delete-thumbnail', { system, game, root }),
	deleteRom: (system: string, game: string, root?: string) => ipcRenderer.invoke('delete-rom', { system, game, root }),
	createSystemDir: (system: string, root?: string) => ipcRenderer.invoke('create-system-dir', { system, root }),
	getThumbnail: (system: string, game: string, root?: string) => ipcRenderer.invoke('get-thumbnail', { system, game, root }),
	openExternal: (url: string) => ipcRenderer.invoke('open-external', { url })
});

export {};
