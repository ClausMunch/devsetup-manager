import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchTools } from './toolApi.js';
import { loadConfig, saveConfig } from './configService.js';
import { installTool as installer } from './toolInstaller.js';
import appManager from './appManager.js';
import { getBinDir, getConfigDir, getLogDir } from './pathService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let toolStatus: Record<string, 'installed'|'running'|'stopped'|'not_installed'> = {};
let config: any = { installedTools: {} };
let installProgress: Record<string, number> = {};

async function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
  preload: path.join(__dirname, 'preload.cjs')
    }
  });

  await win.loadURL('http://localhost:5173');
}

app.whenReady().then(async () => {
  console.log('App ready, loading config');
  config = await loadConfig();
  toolStatus = { ...(config.installedTools || {}) } as any;

  // Ensure directories exist
  const fs = await import('fs/promises');
  await fs.mkdir(getBinDir(), { recursive: true });
  await fs.mkdir(getConfigDir(), { recursive: true });
  await fs.mkdir(getLogDir(), { recursive: true });

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
  // lookup exec path from configured bin dir
  const ver = config.installedTools?.[name];
  const binBase = getBinDir();
  const ext = process.platform === 'win32' ? '.exe' : '';
  const execPath = path.join(binBase, name, ver || '', name + ext);
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

  ipcMain.handle('get-installed-versions', async () => {
    return config.installedTools || {};
  });

  ipcMain.handle('uninstall-tool', async (_e, name: string) => {
    console.log('Uninstall requested', name);
    try{
      const ver = config.installedTools?.[name];
      const { uninstallTool } = await import('./toolInstaller.js');
      await uninstallTool(name, ver);
      delete config.installedTools?.[name];
      await saveConfig(config);
      toolStatus[name] = 'not_installed';
      return { ok: true };
    }catch(e){ console.error(e); return { ok:false, error:String(e)} }
  });

  // nginx config management: store a simple sites.json and generate nginx.conf
  ipcMain.handle('get-nginx-sites', async () => {
    try{
      const cfgPath = path.join(getConfigDir(), 'nginx', 'sites.json');
      const fsp = await import('fs/promises');
      const raw = await fsp.readFile(cfgPath, 'utf-8').catch(()=>'');
      return raw ? JSON.parse(raw) : { webDir: '', folders: [] };
    }catch(e){ console.error('get-nginx-sites failed', e); return { webDir:'', folders:[] } }
  });

  ipcMain.handle('set-nginx-sites', async (_e, cfg: { webDir:string, folders:string[] }) => {
    try{
      const fsp = await import('fs/promises');
      const cfgDir = path.join(getConfigDir(), 'nginx');
      await fsp.mkdir(cfgDir, { recursive: true });
      // validate folders exist first
      const missing: string[] = [];
      for(const folder of cfg.folders || []){
        try{ await fsp.access(folder); }catch(e){ missing.push(folder); }
      }
      if(missing.length>0){
        return { ok:false, error: 'Missing folders: ' + missing.join(', '), missing };
      }
      const cfgPath = path.join(cfgDir, 'sites.json');
      await fsp.writeFile(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');

      // generate a simple nginx.conf into the nginx config dir
      const nginxConfPath = path.join(cfgDir, 'nginx.conf');
      const serverParts:string[] = [];
      serverParts.push('worker_processes  1;');
      serverParts.push('events { worker_connections 1024; }');
      serverParts.push('http {');
      serverParts.push('  include       mime.types;');
      serverParts.push('  default_type  application/octet-stream;');
      serverParts.push('  sendfile        on;');
      serverParts.push('  keepalive_timeout  65;');
      serverParts.push('  server {');
      serverParts.push('    listen       8080;');
      serverParts.push('    server_name  localhost;');

      // for each folder create a location mapping
      for(const folder of cfg.folders || []){
        const name = path.basename(folder).replace(/[^a-zA-Z0-9_-]/g,'');
        const loc = `/${name}`;
        // use alias to map path directly
        serverParts.push(`    location ${loc}/ {`);
        serverParts.push(`      alias ${folder.replace(/\\/g,'/')}/;`);
        serverParts.push('      index index.html;');
        serverParts.push('      try_files $uri $uri/ /index.html;');
        serverParts.push('    }');
      }

      serverParts.push('  }');
      serverParts.push('}');

      await fsp.writeFile(nginxConfPath, serverParts.join('\n'), 'utf-8');
      // attempt to update Windows hosts file to point friendly names to localhost
      let hostsResult: { updated?: boolean; error?: string } = {};
      try{
        if(process.platform === 'win32'){
          const hostsPath = path.join(process.env['SystemRoot'] || 'C:\\Windows','System32','drivers','etc','hosts');
          try{
            let hostsRaw = await fsp.readFile(hostsPath, 'utf-8');
            const startMarker = '# devsetup-manager hosts START';
            const endMarker = '# devsetup-manager hosts END';
            // remove previous section if present
            const sIdx = hostsRaw.indexOf(startMarker);
            if(sIdx !== -1){
              const eIdx = hostsRaw.indexOf(endMarker, sIdx);
              if(eIdx !== -1){
                hostsRaw = hostsRaw.slice(0, sIdx) + hostsRaw.slice(eIdx + endMarker.length);
              } else {
                hostsRaw = hostsRaw.slice(0, sIdx);
              }
            }

            // collect names from webDir and folders
            const names = Array.from(new Set([
              ...(cfg.webDir? [cfg.webDir] : []),
              ...(cfg.folders || [])
            ].filter(Boolean).map((p:any)=> path.basename(String(p)).replace(/[^a-zA-Z0-9_-]/g,'').toLowerCase())));

            if(names.length>0){
              const hostLines = names.map(n=> `127.0.0.1 ${n}.devsetup`);
              const section = '\n' + startMarker + '\n' + hostLines.join('\n') + '\n' + endMarker + '\n';
              const newHosts = hostsRaw.trimEnd() + '\n' + section;
              await fsp.writeFile(hostsPath, newHosts, 'utf-8');
              hostsResult.updated = true;
            } else {
              // if no names, ensure we removed previous section
              await fsp.writeFile(hostsPath, hostsRaw, 'utf-8');
              hostsResult.updated = true;
            }
          }catch(herr){
            // likely permission denied; surface message but do not fail the whole operation
            hostsResult.error = String(herr);
          }
        }
      }catch(e){ hostsResult.error = String(e); }

      return { ok:true, path: nginxConfPath, hosts: hostsResult };
    }catch(e){ console.error('set-nginx-sites failed', e); return { ok:false, error:String(e) } }
  });

  // show open directory dialog
  const { dialog } = await import('electron');
  ipcMain.handle('open-directory', async () => {
    try{
      const res = await dialog.showOpenDialog({ properties:['openDirectory'] });
      if(res.canceled || !res.filePaths || res.filePaths.length===0) return null;
      return res.filePaths[0];
    }catch(e){ console.error('open-directory failed', e); return null; }
  });

  // reload nginx: if nginx is running under manager, stop+start it
  ipcMain.handle('reload-nginx', async () => {
    try{
      if(toolStatus['nginx'] === 'running'){
        // stop then start (simple reload)
        await appManager.stopToolProcess('nginx');
        const ver = config.installedTools?.['nginx'];
        const execPath = path.join(getBinDir(), 'nginx', ver || '', 'nginx' + (process.platform==='win32'?'.exe':''));
        await appManager.startToolProcess('nginx', execPath, []);
      }
      return { ok:true };
    }catch(e){ console.error('reload-nginx failed', e); return { ok:false, error:String(e) } }
  });

  // remove devsetup-manager hosts section from system hosts file (Windows only)
  ipcMain.handle('remove-devsetup-hosts', async () => {
    try{
      if(process.platform !== 'win32') return { ok:true, info: 'Not Windows, nothing to do' };
      const fsp = await import('fs/promises');
      const hostsPath = path.join(process.env['SystemRoot'] || 'C:\\Windows','System32','drivers','etc','hosts');
      let hostsRaw = await fsp.readFile(hostsPath, 'utf-8');
      const startMarker = '# devsetup-manager hosts START';
      const endMarker = '# devsetup-manager hosts END';
      const sIdx = hostsRaw.indexOf(startMarker);
      if(sIdx === -1) return { ok:true, info: 'No devsetup-manager section found' };
      const eIdx = hostsRaw.indexOf(endMarker, sIdx);
      let newHosts = hostsRaw;
      if(eIdx !== -1) newHosts = hostsRaw.slice(0, sIdx) + hostsRaw.slice(eIdx + endMarker.length);
      else newHosts = hostsRaw.slice(0, sIdx);
      await fsp.writeFile(hostsPath, newHosts, 'utf-8');
      return { ok:true, info: 'Removed devsetup-manager hosts section' };
    }catch(e){ return { ok:false, error: String(e) } }
  });

  createWindow();
});
