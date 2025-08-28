import { contextBridge, ipcRenderer } from 'electron';
console.log('Preload script loaded');
contextBridge.exposeInMainWorld('electronAPI', {
    fetchTools: () => ipcRenderer.invoke('fetch-tools'),
    installTool: (name, version, downloadUrl, checksum) => ipcRenderer.invoke('install-tool', name, version, downloadUrl, checksum),
    startTool: (name) => ipcRenderer.invoke('start-tool', name),
    stopTool: (name) => ipcRenderer.invoke('stop-tool', name),
    getStatus: () => ipcRenderer.invoke('get-status'),
    getLogs: (name) => ipcRenderer.invoke('get-logs', name),
    getInstallProgress: (name) => ipcRenderer.invoke('get-install-progress', name)
});
console.log('electronAPI exposed');
