import { contextBridge, ipcRenderer } from 'electron';

console.log('Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  fetchTools: () => ipcRenderer.invoke('fetch-tools'),
  installTool: (name: string, version: string, downloadUrl: string, checksum?: string) => ipcRenderer.invoke('install-tool', name, version, downloadUrl, checksum),
  startTool: (name: string) => ipcRenderer.invoke('start-tool', name),
  stopTool: (name: string) => ipcRenderer.invoke('stop-tool', name),
  getStatus: () => ipcRenderer.invoke('get-status'),
  getLogs: (name: string) => ipcRenderer.invoke('get-logs', name),
  getInstallProgress: (name: string) => ipcRenderer.invoke('get-install-progress', name)
  ,getNginxSites: () => ipcRenderer.invoke('get-nginx-sites')
  ,setNginxSites: (cfg:{webDir:string,folders:string[]}) => ipcRenderer.invoke('set-nginx-sites', cfg)
  ,getInstalledVersions: () => ipcRenderer.invoke('get-installed-versions')
  ,openDirectory: () => ipcRenderer.invoke('open-directory')
  ,reloadNginx: () => ipcRenderer.invoke('reload-nginx')
  ,removeDevsetupHosts: () => ipcRenderer.invoke('remove-devsetup-hosts')
});

console.log('electronAPI exposed');
