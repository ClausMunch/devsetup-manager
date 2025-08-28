import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchTools } from './toolApi.js';
import { loadConfig, saveConfig } from './configService.js';
import { installTool as installer } from './toolInstaller.js';
import appManager from './appManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let toolStatus: Record<string, 'installed'|'running'|'stopped'|'not_installed'> = {};
let config: any = { installedTools: {} };
let installProgress: Record<string, number> = {};

async function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  await win.loadURL('http://localhost:5173');
}

app.whenReady().then(async () => {
  console.log('App ready, loading config');
  config = await loadConfig();
  toolStatus = { ...(config.installedTools || {}) } as any;

  ipcMain.handle('fetch-tools', async () => {
    console.log('IPC fetch-tools called');
    try {
      const result = await fetchTools();
      console.log('Fetch result:', result);
      // initialize status map
      result.tools.forEach((t: any) => { if (!toolStatus[t.name]) toolStatus[t.name] = 'not_installed'; });
      return result;
    } catch (error) {
      console.error('Error in fetch-tools:', error);
      throw error;
    }
  });

  ipcMain.handle('install-tool', async (_e, name: string, version: string, downloadUrl: string, checksum?:string) => {
    console.log('Install requested', name, version, downloadUrl);
    try {
      installProgress[name] = 0;
      // call installer with progress callback
      const saved = await installer(name, version, downloadUrl, checksum, (p:number)=>{ installProgress[name]=p; });
      config.installedTools = config.installedTools || {};
      config.installedTools[name] = version;
      await saveConfig(config);
      toolStatus[name] = 'stopped';
      return { ok: true, path: saved };
    } catch (err) {
      console.error('Install failed', err);
      return { ok: false, error: String(err) };
    } finally {
      installProgress[name] = 100;
    }
  });

  ipcMain.handle('get-install-progress', async (_e, name:string)=>{
    return installProgress[name] || 0;
  });

  ipcMain.handle('start-tool', async (_e, name: string) => {
    console.log('Start requested', name);
    try{
      // lookup exec path from userData install
      const ver = config.installedTools?.[name];
      const base = app.getPath('userData');
      const execPath = path.join(base, 'tools', name, ver || '', name + '.exe');
      await appManager.startToolProcess(name, execPath, []);
      toolStatus[name]='running';
      return { ok: true };
    }catch(e){ console.error(e); return { ok:false, error:String(e)} }
  });

  ipcMain.handle('stop-tool', async (_e, name: string) => {
    console.log('Stop requested', name);
    try{ await appManager.stopToolProcess(name); toolStatus[name]='stopped'; return { ok:true }; }catch(e){ return { ok:false, error:String(e)} }
  });

  ipcMain.handle('get-status', async () => {
    return toolStatus;
  });

  ipcMain.handle('get-logs', async (_e, name: string) => {
    return appManager.getToolLogs(name);
  });

  createWindow();
});
