import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
	saveImage: (name: string, buffer: ArrayBuffer) => ipcRenderer.invoke('save-image', { name, buffer })
});

export {};
