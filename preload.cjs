const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload CJS script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  fetchTools: () => ipcRenderer.invoke('fetch-tools'),
  installTool: (name, version, downloadUrl, checksum) => ipcRenderer.invoke('install-tool', name, version, downloadUrl, checksum),
  startTool: (name) => ipcRenderer.invoke('start-tool', name),
  stopTool: (name) => ipcRenderer.invoke('stop-tool', name),
  getStatus: () => ipcRenderer.invoke('get-status'),
  getLogs: (name) => ipcRenderer.invoke('get-logs', name),
  getInstallProgress: (name) => ipcRenderer.invoke('get-install-progress', name)
  ,getNginxSites: () => ipcRenderer.invoke('get-nginx-sites')
  ,setNginxSites: (cfg) => ipcRenderer.invoke('set-nginx-sites', cfg)
  ,getInstalledVersions: () => ipcRenderer.invoke('get-installed-versions')
  ,openDirectory: () => ipcRenderer.invoke('open-directory')
  ,reloadNginx: () => ipcRenderer.invoke('reload-nginx')
  ,removeDevsetupHosts: () => ipcRenderer.invoke('remove-devsetup-hosts')
});

console.log('electronAPI (CJS) exposed');
