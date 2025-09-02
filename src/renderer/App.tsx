// Theme switching utility (must match main.tsx)
const THEME_KEY = 'dsm_theme';
const THEMES = {
  dark: new URL('./herd-theme.css', import.meta.url).href,
  light: new URL('./dsm-theme-light.css', import.meta.url).href,
};
function setTheme(theme: string) {
  localStorage.setItem(THEME_KEY, theme);
  // @ts-ignore
  if (window.loadTheme) window.loadTheme(theme);
  else {
    // fallback: try to find and update link
  const file = THEMES[theme as keyof typeof THEMES] || THEMES.dark;
    let link = document.getElementById('dsm-theme-link') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = 'dsm-theme-link';
      document.head.appendChild(link);
    }
    link.href = file;
  }
}
// ToolPage component for individual tool management (e.g. PHP)
function ToolPage({ tool, installedVersion, status, progress, onInstall, onUninstall, onStart, onStop, onOpenLogs, uninstalling }: any) {
  return (
    <div>
      <div className="section-title">{tool.displayName} Versions</div>
      <table className="table">
        <thead>
          <tr><th>Version</th><th>Status</th><th>Action</th></tr>
        </thead>
        <tbody>
          {tool.versions.map((v:any) => (
            <tr key={v.version}>
              <td>{v.version}</td>
              <td>{installedVersion === v.version ? <span className="status-dot running"/> : <span className="status-dot"/>}{installedVersion === v.version ? 'Installed' : 'Not installed'}</td>
              <td>
                {installedVersion === v.version ? (
                  <>
                    <button onClick={()=>onUninstall(tool.name)} disabled={uninstalling}>Uninstall</button>
                    <button onClick={()=>onOpenLogs(tool.name)}>Logs</button>
                  </>
                ) : (
                  <button onClick={()=>onInstall(tool.name, v.version, v.platforms?.windows?.arch?.x64?.downloadUrl, v.platforms?.windows?.arch?.x64?.checksum)}>Install</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ServicesPage component for managing all services
function ServicesPage({ services, statusMap, installedMap, onStart, onStop, onOpenLogs, onAddService }: any) {
  return (
    <div>
      <div className="section-title">Services</div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <button className="add-service-btn" onClick={()=>onAddService && onAddService()}>Add Service</button>
      </div>
      <div className="tools-list">
        {
          // show only installed services
          (() => {
            const installedNames = new Set(Object.keys(installedMap || {}));
            // services that are known and installed
            const knownInstalled = (services || []).filter((s:any) => installedNames.has(s.name));
            // any installed names not present in services (persisted/custom)
            const extra = Array.from(installedNames).filter(n => !(services || []).find((s:any)=>s.name === n)).map(n=>({ name: n, displayName: n }));
            const list = [...knownInstalled, ...extra];
            if(list.length === 0) return <div style={{color:'var(--muted)'}}>No services installed.</div>;
            return list.map((svc:any) => (
              <div key={svc.name} className="tool-row">
                <span className={`status-dot ${statusMap[svc.name]||'installed'}`}/>
                <span className="tool-name">{svc.displayName || svc.name}</span>
                <span className="tool-version">{installedMap[svc.name] || 'Unknown'}</span>
                <div className="tool-actions">
                  {statusMap[svc.name]==='running' ? (
                    <button onClick={()=>onStop(svc.name)}>Stop</button>
                  ) : (
                    <button onClick={()=>onStart(svc.name)}>Start</button>
                  )}
                  <button onClick={()=>onOpenLogs(svc.name)}>Logs</button>
                </div>
              </div>
            ));
          })()
        }
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { getCachedToolsJson } from './toolsCache';

type Tool = {
  name: string;
  displayName: string;
  versions: {
    version: string;
    platforms: any;
  }[];
};
type Service = {
  name: string;
  displayName: string;
  category?: string;
  versions: {
    version: string;
    platforms: any;
  }[];
};

declare global {
  interface Window {
    electronAPI?: {
      fetchTools: () => Promise<{ tools: Tool[]; services?: Service[] }>; // allow services in result
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
  listDirectories?: (dirPath:string)=>Promise<string[]>;
    }
  }
}


export default function App(){
  const [page, setPage] = useState<string>('dashboard');
  const [nginxCfg, setNginxCfg] = useState<{webDir:string,folders:string[]}>({webDir:'',folders:[]});
  const [projects, setProjects] = useState<string[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [statusMap, setStatusMap] = useState<Record<string,string>>({});
  const [installedMap, setInstalledMap] = useState<Record<string,string>>({});
  const [progressMap, setProgressMap] = useState<Record<string,number>>({});
  const [uninstalling, setUninstalling] = useState<Record<string,boolean>>({});
  const [logsModal, setLogsModal] = useState<{open:boolean, tool?:string}>({open:false});
  const [logs, setLogs] = useState<string[]>([]);

  const [hostsStatus, setHostsStatus] = useState<string | null>(null);
  const [theme, setThemeState] = useState<string>(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [addSvcOpen, setAddSvcOpen] = useState(false);
  const [newSvc, setNewSvc] = useState<{category:string, serviceName:string, displayName:string, port:string, autoStart:boolean, version?:string}>({category:'database', serviceName:'', displayName:'', port:'', autoStart:false, version: undefined});
  function openAddService(prefillCategory?: string) {
    const cat = prefillCategory || 'database';
    const first = services.find((s:any)=>s.category === cat);
  setNewSvc({ category: cat, serviceName: first?.name || '', displayName: first ? (first.displayName || first.name) : '', port: (first ? ((first as any).port || (first as any).versions?.[0]?.port) : '') || '', autoStart: !!(first && (first as any).autoStart), version: first?.versions?.[0]?.version });
    setModalErrors({});
    setAddSvcOpen(true);
  }
  const [modalErrors, setModalErrors] = useState<{port?:string, service?:string}>({});



  // Load tools/services from cache or gist, refresh every 1 hour
  useEffect(() => {
  let refreshTimer: any;
    let cancelled = false;
    async function loadTools(forceRefresh = false) {
      setLoading(true);
      setError(null);
      try {
        let data;
        if (window.electronAPI) {
          try {
            data = await window.electronAPI.fetchTools();
          } catch (e) {
            // fallback to gist
            data = await getCachedToolsJson(forceRefresh);
          }
        } else {
          data = await getCachedToolsJson(forceRefresh);
        }
        if (!cancelled) {
          setTools(data.tools || []);
          setServices(data.services || []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTools();
    // Set up periodic refresh
    refreshTimer = setInterval(() => loadTools(true), 60 * 60 * 1000); // 1 hour
    return () => { cancelled = true; clearInterval(refreshTimer); };
  }, []);

  // load persisted nginx sites and populate projects on startup
  useEffect(() => {
    (async () => {
      try {
        if(window.electronAPI?.getNginxSites){
          const cfg = await window.electronAPI.getNginxSites();
          if(cfg){ setNginxCfg(cfg); if(cfg.folders) await refreshProjects(cfg.folders); }
        }
      } catch (e) { /* ignore */ }
    })();
  }, []);

  // load installed versions
  useEffect(() => { (async () => { try { const map = await window.electronAPI?.getInstalledVersions?.() || {}; setInstalledMap(map); } catch (e) { } })(); }, []);

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

  // refresh projects list from folders
  const refreshProjects = async (folders?: string[]) => {
    const f = folders || nginxCfg.folders || [];
    if(!window.electronAPI?.listDirectories) { setProjects([]); return; }
    try{
      const all: string[] = [];
      for(const folder of f){
        try{
          const subs = await window.electronAPI.listDirectories(folder);
          // store relative or full paths; keep full path for now
          for(const s of subs) all.push(s);
        }catch(e){ }
      }
      setProjects(all);
    }catch(e){ setProjects([]); }
  }

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
          {tools.map(tool => (
            <button key={tool.name} className={page===tool.name ? 'active' : ''} onClick={()=>setPage(tool.name)}>{tool.displayName}</button>
          ))}
          <button className={page==='services'? 'active':''} onClick={()=>setPage('services')}>Services</button>
          <button className={page==='projects'? 'active':''} onClick={()=>setPage('projects')}>Projects</button>
          <button className={page==='settings'? 'active':''} onClick={()=>setPage('settings')}>Settings</button>
        </nav>
        <div className="footer">v1.0 • Local</div>
      </aside>
      <main className="content">
        <div className="header">
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <h2 style={{margin:0}}>{page==='dashboard' ? 'Dashboard' : page==='tools' ? 'Tools' : page==='projects' ? 'Projects' : 'Settings'}</h2>
            {loading && <div className="spinner"/>}
          </div>
          <div style={{color:'var(--muted)',fontSize:15}}>{tools.length} tools</div>
        </div>

        {page==='dashboard' && (
          <div style={{display:'flex',gap:32,alignItems:'flex-start'}}>
            <div style={{flex:2}}>
              <div className="card">
                <div className="section-title">Active Services</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Version</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(installedMap).length === 0 && (
                      <tr><td colSpan={3} style={{color:'var(--muted)'}}>No services installed.</td></tr>
                    )}
                    {Object.entries(installedMap).map(([name, version]) => (
                      <tr key={name}>
                        <td><span className={`status-dot ${statusMap[name]||'installed'}`}/>{tools.find(t=>t.name===name)?.displayName || name}</td>
                        <td>{version}</td>
                        <td style={{textTransform:'capitalize'}}>{statusMap[name] || 'installed'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{flex:1,minWidth:260}}>
              <div className="card">
                <div className="section-title">Quick Access</div>
                <div className="quick-actions">
                  <button>Install selected</button>
                  <button>Start all</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tool pages */}
        {tools.map(tool => (
          page === tool.name && (
            <ToolPage
              key={tool.name}
              tool={tool}
              installedVersion={installedMap[tool.name]}
              status={statusMap[tool.name]}
              progress={progressMap[tool.name]}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onStart={handleStart}
              onStop={handleStop}
              onOpenLogs={openLogs}
              uninstalling={uninstalling[tool.name]}
            />
          )
        ))}
        {/* Services page */}
        {page==='services' && (
          <ServicesPage
            services={services}
            statusMap={statusMap}
            installedMap={installedMap}
            onStart={handleStart}
            onStop={handleStop}
            onOpenLogs={openLogs}
            onAddService={()=> openAddService()}
          />
        )}

        {addSvcOpen && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-header"><h3>Create a new service</h3></div>
              <div className="modal-body">
                <div style={{display:'grid',gridTemplateColumns:'120px 1fr',gap:12,alignItems:'center'}}>
                  <label>Category:</label>
                  <select value={newSvc.category} onChange={e=>{
                    const cat = e.target.value;
                    // pick first service in this category
                    const first = services.find((s:any)=>s.category === cat);
                    setNewSvc(s=>({ ...s, category: cat, serviceName: first?.name || '', displayName: first ? (first.displayName || first.name) : s.displayName, port: (first ? (((first as any).port) || ((first as any).versions?.[0]?.port)) : '') || '', version: first?.versions?.[0]?.version }));
                  }}>
                    <option value="database">Database</option>
                    <option value="web">Web</option>
                    <option value="email">Email</option>
                    <option value="queue">Queue</option>
                    <option value="other">Other</option>
                  </select>

                  <label>Service:</label>
                  <select value={newSvc.serviceName} onChange={e=>{
                    const svcName = e.target.value;
                    const svc = services.find(s=>s.name===svcName);
                    setNewSvc(s=>({ ...s, serviceName:svcName, displayName: svc?.displayName || svcName, port: ((svc as any)?.port) || ((svc as any)?.versions?.[0]?.port) || '', version: svc?.versions?.[0]?.version }));
                  }}>
                    <option value="">-- select --</option>
                    {services.filter((s:any)=>!newSvc.category || s.category===newSvc.category).map((s:any)=> (<option key={s.name} value={s.name}>{s.displayName} {s.versions?.[0]?.version ? `(${s.versions[0].version})` : ''}</option>))}
                  </select>

                  <label>Name:</label>
                  <input value={newSvc.displayName} onChange={e=>setNewSvc(s=>({ ...s, displayName:e.target.value }))} />

                  <label>Version:</label>
                  <select value={newSvc.version || ''} onChange={e=>setNewSvc(s=>({ ...s, version: e.target.value }))}>
                    <option value="">(latest)</option>
                    {(services.find(s=>s.name===newSvc.serviceName)?.versions || []).map((v:any)=>(<option key={v.version} value={v.version}>{v.version}</option>))}
                  </select>

                  <label>Port:</label>
                  <input value={newSvc.port} onChange={e=>{ setNewSvc(s=>({ ...s, port:e.target.value })); setModalErrors(me=>({ ...me, port: undefined })); }} />
                  <div style={{gridColumn:'2 / span 1', color: 'var(--status-stopped)', fontSize:12}}>{modalErrors.port}</div>

                  <label />
                  <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={newSvc.autoStart} onChange={e=>setNewSvc(s=>({ ...s, autoStart:e.target.checked }))}/> Automatically start with DSM</label>
                </div>
              </div>
              <div className="modal-footer" style={{display:'flex',justifyContent:'flex-end',gap:8}}>
                <button onClick={()=>{ setModalErrors({}); setAddSvcOpen(false); }}>Cancel</button>
                
                <button onClick={async ()=>{
                  const payload = { name: newSvc.serviceName, displayName: newSvc.displayName || newSvc.serviceName, category: newSvc.category, port: newSvc.port, autoStart: newSvc.autoStart };
                    // validation
                    const errs: any = {};
                    if(!payload.name) errs.service = 'Select a service';
                    if(payload.port) {
                      const p = Number(payload.port);
                      if(!Number.isInteger(p) || p < 1 || p > 65535) errs.port = 'Port must be an integer between 1 and 65535';
                    }
                    if(Object.keys(errs).length) { setModalErrors(errs); return; }
                  try {
                    // prefer catalog metadata when deciding how to install
                    const meta = services.find((s:any)=>s.name === payload.name);
                    let created: any = null;
                    if(window.electronAPI && (window.electronAPI as any).createService) {
                      const res = await (window.electronAPI as any).createService(payload);
                      if(!res.ok) { alert('Failed to create service: '+res.error); return; }
                      created = res.service;
                      // merge versions from meta if res.service didn't include them
                      if(meta && (!created.versions || created.versions.length === 0)) {
                        created = Object.assign({}, created, { versions: meta.versions });
                      }
                      // append to local services state (avoid dupes)
                      setServices(s=>{
                        if(s.find((x:any)=>x.name===created.name)) return s;
                        return [...s, created];
                      });
                    } else {
                      // local simulation: add to installedMap and local services
                      setInstalledMap(m=>({ ...m, [payload.name]: 'installed' }));
                      const localSvc = meta ? Object.assign({}, meta) : { name: payload.name, displayName: payload.displayName, category: payload.category, versions: [] };
                      setServices(s=>{
                        if(s.find((x:any)=>x.name===localSvc.name)) return s;
                        return [...s, localSvc];
                      });
                      created = localSvc;
                    }

                    // determine version info to install: prefer meta (original catalog), then created
                    const svc = meta || created;
                    let versionInfo: any = null;
                    if(svc && svc.versions && svc.versions.length > 0) {
                      if(newSvc.version) {
                        versionInfo = svc.versions.find((v:any)=>v.version === newSvc.version) || svc.versions[0];
                      } else {
                        versionInfo = svc.versions[0];
                      }
                    }
                    if(versionInfo) {
                      const version = (versionInfo as any).version || (versionInfo as any).tag || '';
                      // try to find a windows x64 download url
                      const downloadUrl = ((versionInfo as any).platforms && (versionInfo as any).platforms.windows && (versionInfo as any).platforms.windows.arch && (versionInfo as any).platforms.windows.arch.x64 && (versionInfo as any).platforms.windows.arch.x64.downloadUrl) || (versionInfo as any).downloadUrl || '';
                      const checksum = (versionInfo as any).checksum || undefined;
                      if(!downloadUrl) {
                        console.warn('No download URL found for service', payload.name);
                      } else {
                        try {
                          await handleInstall(payload.name, version, downloadUrl, checksum);
                          // refresh installed versions map after install
                          try{ const im = await window.electronAPI?.getInstalledVersions?.() || {}; setInstalledMap(im); }catch(e){}
                        } catch(e) {
                          console.error('Install failed', e);
                        }
                      }
                    } else {
                      console.warn('No version info available to install for', payload.name);
                    }

                    // if autoStart requested, try to start
                    if(payload.autoStart && window.electronAPI?.startTool) {
                      try { await window.electronAPI.startTool(payload.name); } catch(e) { console.error('autoStart failed', e); }
                    }
                  } catch(e) {
                    console.error('Save/install failed', e);
                    alert('Save/install failed: '+String(e));
                  } finally {
                    setAddSvcOpen(false);
                  }
                }}>Save</button>
              </div>
            </div>
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
              <h4>Theme</h4>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>
                <label className="small">Select theme:</label>
                <select value={theme} onChange={e => {
                  setThemeState(e.target.value);
                  setTheme(e.target.value);
                }}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              <h4>Herd paths</h4>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <div style={{color:'var(--muted)'}}>All sub-folders in these directories will be available via Herd.</div>
                <div style={{display:'flex',justifyContent:'flex-start',marginTop:6}}>
                  <button onClick={async ()=>{
                    if(!window.electronAPI?.openDirectory) return alert('Picker unavailable');
                    const p = await window.electronAPI.openDirectory();
                    if(p){
                      const uniq = Array.from(new Set([...(nginxCfg.folders||[]), p]));
                      setNginxCfg(c=>({ ...c, folders: uniq }));
                      refreshProjects(uniq);
                    }
                  }} style={{padding:'8px 12px',borderRadius:8,background:'var(--panel)',border:'1px solid rgba(255,255,255,0.06)'}}>Add path</button>
                </div>

                <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:8}}>
                  {(nginxCfg.folders || []).map(f=> (
                    <div key={f} style={{border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:14,display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,255,255,0.01)'}}>
                      <div style={{color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={f}>{f}</div>
                        <button onClick={async ()=>{
                        const newFolders = nginxCfg.folders.filter((x:any)=>x!==f);
                        setNginxCfg(c=>({ ...c, folders: newFolders }));
                        refreshProjects(newFolders);
                      }} style={{background:'transparent',border:'none',padding:8,cursor:'pointer'}} aria-label={`Remove ${f}`}>
                        <span style={{display:'inline-flex',width:28,height:28,borderRadius:6,background:'rgba(255,255,255,0.02)',alignItems:'center',justifyContent:'center'}}>🗑️</span>
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{display:'flex',gap:8}}>
                  <button onClick={async ()=>{
                    if(!window.electronAPI?.listDirectories) return;
                    // If there are configured folders, refresh projects from them
                    if((nginxCfg.folders || []).length > 0){
                      // For each configured root path, list its immediate subdirectories
                      const allSubs: string[] = [];
                      for(const root of nginxCfg.folders){
                        try{
                          const subs = await window.electronAPI.listDirectories(root);
                          for(const s of subs) allSubs.push(s);
                        }catch(e){ /* ignore individual errors */ }
                      }
                      const uniq = Array.from(new Set(allSubs));
                      // Replace expose list with discovered subfolders
                      setNginxCfg(c=>({ ...c, folders: uniq }));
                      await refreshProjects(uniq);
                      return;
                    }
                    // fallback: if webDir exists, populate folders from it
                    if(nginxCfg.webDir){
                      const dirs = await window.electronAPI.listDirectories(nginxCfg.webDir);
                      setNginxCfg(c=>({ ...c, folders: dirs }));
                      await refreshProjects(dirs);
                      return;
                    }
                    alert('No folders configured. Use Add path to add folders or set a web root first.');
                  }}>Refresh folders</button>
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
                      refreshProjects(nginxCfg.folders || []);
                    }
                  }}>Save</button>
                  <button onClick={async ()=>{ if(!window.electronAPI?.getNginxSites) return; const cfg = await window.electronAPI.getNginxSites(); setNginxCfg(cfg); refreshProjects(cfg.folders || []); }}>Load</button>
                  {hostsStatus && <div style={{marginLeft:8,alignSelf:'center'}} className="small">{hostsStatus}</div>}
                  <button onClick={async ()=>{
                    if(!window.electronAPI?.removeDevsetupHosts) return alert('Remove hosts unavailable');
                    const r = await window.electronAPI.removeDevsetupHosts();
                    if(!r.ok) setHostsStatus('Remove hosts failed: '+(r.error||'unknown')); else setHostsStatus('Remove hosts: '+(r.info||'done'));
                  }} style={{marginLeft:8}}>Remove hosts entries</button>
                </div>

                <div style={{marginTop:10}}>
                  <h5>Projects (discovered)</h5>
                  {projects.length === 0 ? <div className="small" style={{color:'var(--muted)'}}>No projects found. Add folders or refresh.</div> : (
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {projects.map(p => (<div key={p} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={p}>{p}</div>
                        <div style={{fontSize:12,color:'var(--muted)'}}>{p.split('\\').pop()}</div>
                      </div>))}
                    </div>
                  )}
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
