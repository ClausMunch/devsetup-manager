import { contextBridge, ipcRenderer } from 'electron';

console.log('Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  fetchTools: () => ipcRenderer.invoke('fetch-tools')
});

console.log('electronAPI exposed');
