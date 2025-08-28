import React, { useEffect, useState } from 'react';

type Tool = {
  name: string;
  displayName: string;
  versions: {
    version: string;
    platforms: any;
  }[];
};

declare global {
  interface Window {
    electronAPI?: {
      fetchTools: () => Promise<{ tools: Tool[] }>;
      installTool?: (name:string, version:string, downloadUrl:string, checksum?:string)=>Promise<any>;
      uninstallTool?: (name:string)=>Promise<any>;
      startTool?: (name:string)=>Promise<any>;
      stopTool?: (name:string)=>Promise<any>;
      getStatus?: ()=>Promise<Record<string,string>>;
      getLogs?: (name:string)=>Promise<string[]>;
      getInstallProgress?: (name:string)=>Promise<number>;
  getNginxSites?: ()=>Promise<{webDir:string,folders:string[]}>;
  setNginxSites?: (cfg:{webDir:string,folders:string[]})=>Promise<any>;
  getInstalledVersions?: ()=>Promise<Record<string,string>>;
  openDirectory?: ()=>Promise<string | null>;
  reloadNginx?: ()=>Promise<{ok:boolean,error?:string}>;
  removeDevsetupHosts?: ()=>Promise<{ok:boolean,error?:string,info?:string}>;
    }
  }
}


export default function App(){
  const [page, setPage] = useState<'dashboard'|'tools'|'projects'|'settings'>('dashboard');
  const [nginxCfg, setNginxCfg] = useState<{webDir:string,folders:string[]}>({webDir:'',folders:[]});
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [statusMap, setStatusMap] = useState<Record<string,string>>({});
  const [installedMap, setInstalledMap] = useState<Record<string,string>>({});
  const [progressMap, setProgressMap] = useState<Record<string,number>>({});
  const [uninstalling, setUninstalling] = useState<Record<string,boolean>>({});
  const [logsModal, setLogsModal] = useState<{open:boolean, tool?:string}>({open:false});
  const [logs, setLogs] = useState<string[]>([]);
  const [hostsStatus, setHostsStatus] = useState<string | null>(null);

  useEffect(()=>{
    const GIST_URL = 'https://gist.githubusercontent.com/ClausMunch/04bfece83f9d534aa87691dcd17abbcb/raw/tools.json';
    const directFetch = async ()=>{
      try{ setError(null); setLoading(true); const res = await fetch(GIST_URL); if(!res.ok) throw new Error(`${res.status}`); const data = await res.json(); setTools(data.tools||[]); }
      catch(e:any){ setError(e.message||String(e)); }
      finally{ setLoading(false); }
    }

    if(!window.electronAPI) { directFetch(); return; }
    (async ()=>{
      try{ setError(null); setLoading(true); const data = await window.electronAPI!.fetchTools(); setTools(data.tools||[]); const s = await window.electronAPI!.getStatus?.(); setStatusMap(s||{}); }
      catch(e:any){ console.warn('IPC failed, fallback', e); await directFetch(); }
      finally{ setLoading(false); }
    })();
  // load installed versions
  (async ()=>{ try{ const map = await window.electronAPI?.getInstalledVersions?.() || {}; setInstalledMap(map); }catch(e){} })();
  },[]);

  useEffect(()=>{
    // poll status every 3s if IPC available
    const getStatus = window.electronAPI?.getStatus;
    if(!getStatus) return;
    const id = setInterval(async ()=>{ try{ const s = await getStatus(); setStatusMap(s||{}); }catch(e){ } },3000);
    return ()=>clearInterval(id);
  },[]);

  useEffect(()=>{
    // poll install progress every 800ms
    const getProg = window.electronAPI?.getInstallProgress;
    if(!getProg) return;
    const id = setInterval(async ()=>{
      try{
        const map: Record<string,number> = {};
        for(const t of tools){ map[t.name] = await getProg(t.name) || 0; }
        setProgressMap(map);
  // refresh installed map too (in case install finished)
  try{ const im = await window.electronAPI?.getInstalledVersions?.() || {}; setInstalledMap(im); }catch(e){}
      }catch(e){}
    },800);
    return ()=>clearInterval(id);
  },[tools]);

  const handleInstall = async (name:string, version:string, downloadUrl:string, checksum?:string)=>{
    if(!window.electronAPI?.installTool) { alert('Install not available'); return; }
    setProgressMap(p=>({ ...p, [name]: 1 }));
    const res = await window.electronAPI.installTool(name, version, downloadUrl, checksum);
    if(!res.ok) alert('Install failed: '+res.error);
    const s = await window.electronAPI.getStatus?.(); setStatusMap(s||{});
  }
  const handleUninstall = async (name:string)=>{
    if(!window.electronAPI?.uninstallTool) { alert('Uninstall not available'); return; }
    setUninstalling(u=>({ ...u, [name]: true }));
    const res = await window.electronAPI.uninstallTool(name);
    setUninstalling(u=>({ ...u, [name]: false }));
    if(!res.ok) alert('Uninstall failed: '+res.error);
    const s = await window.electronAPI.getStatus?.(); setStatusMap(s||{});
  }
  const handleStart = async (name:string)=>{
    if(!window.electronAPI?.startTool) { alert('Start not available'); return; }
    await window.electronAPI.startTool(name);
    const s = await window.electronAPI.getStatus?.(); setStatusMap(s||{});
  }
  const handleStop = async (name:string)=>{
    if(!window.electronAPI?.stopTool) { alert('Stop not available'); return; }
    await window.electronAPI.stopTool(name);
    const s = await window.electronAPI.getStatus?.(); setStatusMap(s||{});
  }

  const openLogs = async (name:string)=>{
    setLogsModal({open:true, tool:name});
    const l = await window.electronAPI?.getLogs?.(name) || [];
    setLogs(l);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><div className="logo">DS</div>DevSetup Manager</div>

        <nav className="nav">
          <button className={page==='dashboard'? 'active':''} onClick={()=>setPage('dashboard')}>Dashboard</button>
          <button className={page==='tools'? 'active':''} onClick={()=>setPage('tools')}>Tools</button>
          <button className={page==='projects'? 'active':''} onClick={()=>setPage('projects')}>Projects</button>
          <button className={page==='settings'? 'active':''} onClick={()=>setPage('settings')}>Settings</button>
        </nav>

        <div className="footer">v1.0 • Local</div>
      </aside>

      <main className="content">
        <div className="header">
          <h2 style={{margin:0}}>{page==='dashboard' ? 'Dashboard' : page==='tools' ? 'Tools' : page==='projects' ? 'Projects' : 'Settings'}</h2>
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            {loading? <div style={{display:'flex',alignItems:'center',gap:8}}><div className="spinner"/> <div className="small">Loading...</div></div> : <div className="status-badge">{tools.length} tools</div>}
          </div>
        </div>

        {page==='dashboard' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:14}}>
            <div className="card">
              <h3 style={{marginTop:0}}>Overview</h3>
              <p className="small">Manage your local development tools. Installed, running and available versions are shown in Tools.</p>

              <div style={{marginTop:12}}>
                <strong>Fetch status:</strong>
                <div className="small">{loading? 'Fetching from Gist...' : (error? ('Error: '+error) : 'OK')}</div>
              </div>

            </div>

            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="card">
                <h4 style={{margin:0}}>Quick Actions</h4>
                <div style={{marginTop:8,display:'flex',gap:8}}>
                  <button className="card" style={{cursor:'pointer'}}>Install selected</button>
                  <button className="card" style={{cursor:'pointer'}}>Start all</button>
                </div>
              </div>

              <div className="card">
                <h4 style={{margin:0}}>Status</h4>
                <div style={{marginTop:8}} className="small">{tools.length} tool(s) available</div>
              </div>
            </div>
          </div>
        )}

        {page==='tools' && (
          <div>
            <h3>Available Tools</h3>
            {loading && <div style={{display:'flex',gap:8,alignItems:'center'}}><div className="spinner"/> Loading tools...</div>}
            {!loading && error && <div style={{color:'crimson'}}>Error loading tools: {error}</div>}
            {!loading && !error && (
              <div className="tools-grid">
                {tools.map(t=> (
                  <div key={t.name} className="tool-card">
                    <h3>{t.displayName}</h3>
                    <div className="small">{t.versions.length} version(s)</div>
                    <div style={{marginTop:8}}>
                      {t.versions.map(v=> (
                        <div key={v.version} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
                          <div style={{display:'flex',flexDirection:'column'}}>
                            <div className="small">{v.version}</div>
                            <div className="small">{statusMap[t.name] || 'not_installed'}</div>
                          </div>
                          <div className="actions">
                            <a className="small" href={v.platforms?.windows?.arch?.x64?.downloadUrl} target="_blank">Download</a>
                            {installedMap[t.name] === v.version ? (
                              <div style={{padding:'6px 8px',borderRadius:8,background:'rgba(255,255,255,0.03)'}}>Installed</div>
                            ) : (
                              <button
                                onClick={()=>handleInstall(t.name,v.version,v.platforms?.windows?.arch?.x64?.downloadUrl, v.platforms?.windows?.arch?.x64?.checksum)}
                                style={{padding:'6px 8px',borderRadius:8,cursor: window.electronAPI?.installTool ? 'pointer' : 'not-allowed'}}
                                disabled={!window.electronAPI?.installTool}
                                title={!window.electronAPI?.installTool ? 'Install not available in browser' : 'Install'}
                              >Install</button>
                            )}
                            {progressMap[t.name] > 0 && progressMap[t.name] < 100 && (
                              <div style={{width:120,background:'rgba(255,255,255,0.03)',borderRadius:6,overflow:'hidden'}}>
                                <div style={{height:8,width:`${progressMap[t.name]}%`,background:'linear-gradient(90deg,var(--accent),var(--accent-2))'}}></div>
                              </div>
                            )}
                            {statusMap[t.name]==='running' ? (
                              <button
                                onClick={()=>handleStop(t.name)}
                                style={{padding:'6px 8px',borderRadius:8,cursor: window.electronAPI?.stopTool ? 'pointer' : 'not-allowed'}}
                                disabled={!window.electronAPI?.stopTool}
                                title={!window.electronAPI?.stopTool ? 'Stop not available in browser' : 'Stop'}
                              >Stop</button>
                            ) : (
                              <button
                                onClick={()=>handleStart(t.name)}
                                style={{padding:'6px 8px',borderRadius:8,cursor: window.electronAPI?.startTool ? 'pointer' : 'not-allowed'}}
                                disabled={!window.electronAPI?.startTool}
                                title={!window.electronAPI?.startTool ? 'Start not available in browser' : 'Start'}
                              >Start</button>
                            )}
                            <button
                              onClick={()=>handleUninstall(t.name)}
                              style={{padding:'6px 8px',borderRadius:8,cursor: window.electronAPI?.uninstallTool ? 'pointer' : 'not-allowed'}}
                              disabled={!window.electronAPI?.uninstallTool || uninstalling[t.name]}
                              title={!window.electronAPI?.uninstallTool ? 'Uninstall not available in browser' : 'Uninstall'}
                            >{uninstalling[t.name] ? 'Uninstalling...' : 'Uninstall'}</button>
                            <button
                              onClick={()=>openLogs(t.name)}
                              style={{padding:'6px 8px',borderRadius:8,cursor: window.electronAPI?.getLogs ? 'pointer' : 'not-allowed'}}
                              disabled={!window.electronAPI?.getLogs}
                              title={!window.electronAPI?.getLogs ? 'Logs not available in browser' : 'Logs'}
                            >Logs</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {page==='projects' && (
          <div>
            <h3>Your Projects</h3>
            <div className="card small">Project scanning and hosts will appear here.</div>
          </div>
        )}

        {page==='settings' && (
          <div>
            <h3>Settings</h3>
            <div style={{marginTop:12}} className="card">
              <h4>Nginx Site Configuration</h4>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <label className="small">Web root directory</label>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <input value={nginxCfg.webDir} onChange={(e)=>setNginxCfg(c=>({ ...c, webDir:e.target.value }))} style={{flex:1}} />
                  <button onClick={async ()=>{ if(!window.electronAPI?.openDirectory) return alert('Picker unavailable'); const p = await window.electronAPI.openDirectory(); if(p) setNginxCfg(c=>({ ...c, webDir:p })); }}>Browse</button>
                </div>
                <label className="small">Folders to expose (one per line)</label>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <textarea value={nginxCfg.folders.join('\n')} onChange={(e)=>setNginxCfg(c=>({ ...c, folders: e.target.value.split('\n').map(s=>s.trim()).filter(Boolean) }))} style={{width:'100%',minHeight:120}} />
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={async ()=>{ if(!window.electronAPI?.openDirectory) return alert('Picker unavailable'); const p = await window.electronAPI.openDirectory(); if(p) setNginxCfg(c=>({ ...c, folders: Array.from(new Set([...(c.folders||[]), p])) })); }}>Add folder</button>
                    <button onClick={()=>setNginxCfg(c=>({ ...c, folders: [] }))}>Clear folders</button>
                    <button onClick={async ()=>{ if(!window.electronAPI?.reloadNginx) return alert('Reload unavailable'); const r = await window.electronAPI.reloadNginx(); if(!r.ok) alert('Reload failed: '+r.error); else alert('Reload requested'); }}>Reload Nginx</button>
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={async ()=>{
                    setHostsStatus(null);
                    if(!window.electronAPI?.setNginxSites) return alert('Save unavailable');
                    const res = await window.electronAPI.setNginxSites(nginxCfg);
                    if(!res.ok){
                      alert('Save failed: '+res.error);
                      setHostsStatus('Save failed: '+(res.error||'unknown'));
                    } else {
                      const hostInfo = res.hosts;
                      if(hostInfo){
                        if(hostInfo.error){
                          setHostsStatus('Hosts update: Failed - ' + hostInfo.error);
                        } else if(hostInfo.updated){
                          setHostsStatus('Hosts update: Success');
                        } else {
                          setHostsStatus('Hosts update: No changes');
                        }
                      } else {
                        setHostsStatus('Hosts update: Skipped (non-Windows)');
                      }
                      alert('Saved nginx config at '+res.path);
                    }
                  }}>Save</button>
                  <button onClick={async ()=>{ if(!window.electronAPI?.getNginxSites) return; const cfg = await window.electronAPI.getNginxSites(); setNginxCfg(cfg); }}>Load</button>
                  {hostsStatus && <div style={{marginLeft:8,alignSelf:'center'}} className="small">{hostsStatus}</div>}
                  <button onClick={async ()=>{
                    if(!window.electronAPI?.removeDevsetupHosts) return alert('Remove hosts unavailable');
                    const r = await window.electronAPI.removeDevsetupHosts();
                    if(!r.ok) setHostsStatus('Remove hosts failed: '+(r.error||'unknown')); else setHostsStatus('Remove hosts: '+(r.info||'done'));
                  }} style={{marginLeft:8}}>Remove hosts entries</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {logsModal.open && (
        <div style={{position:'fixed',inset:20,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{width:'80%',height:'70%',background:'var(--panel)',borderRadius:10,padding:12,display:'flex',flexDirection:'column'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h4 style={{margin:0}}>Logs: {logsModal.tool}</h4>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{ setLogsModal({open:false}); setLogs([]);}}>Close</button>
              </div>
            </div>
            <div style={{flex:1,marginTop:8,overflow:'auto',background:'rgba(255,255,255,0.02)',padding:8,borderRadius:8}}>
              {logs.length===0 ? <div className="small">No logs yet.</div> : logs.map((l,i)=> <div key={i} style={{fontFamily:'monospace',fontSize:12,whiteSpace:'pre-wrap'}}>{l}</div>)}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
