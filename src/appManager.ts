import { app } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogDir, getBinDir } from './pathService.js';

type ToolProc = {
  proc: ChildProcessWithoutNullStreams;
  logs: string[];
};

const procs: Record<string, ToolProc> = {};

async function ensureLogDir() {
  const dir = getLogDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function appendLog(tool: string, line: string) {
  try {
    const dir = await ensureLogDir();
    const file = path.join(dir, `${tool}.log`);
    await fs.appendFile(file, line + '\n', 'utf-8');
    // keep small in-memory buffer
    procs[tool] = procs[tool] || ({} as ToolProc);
    procs[tool].logs = procs[tool].logs || [];
    procs[tool].logs.push(line);
    if (procs[tool].logs.length > 500) procs[tool].logs.shift();
  } catch (e) {
    console.error('Failed to append log', e);
  }
}

export async function startToolProcess(tool: string, execPath: string, args: string[] = []) {
  if (procs[tool]) throw new Error('Already running');
  // If execPath is not absolute, try to resolve from bin dir
  let resolved = execPath;
  if (!path.isAbsolute(execPath)) resolved = path.join(getBinDir(), execPath);
  // ensure executable exists; if not try to auto-discover inside the folder
  async function exists(pth:string){ try{ await fs.access(pth); return true; }catch{return false;} }
  const ext = process.platform === 'win32' ? '.exe' : '';
  if (!await exists(resolved)){
    // try name-based resolution inside the directory tree
    const baseDir = path.dirname(resolved);
    async function findExecutable(dir:string, depth=0): Promise<string|undefined>{
      if (depth>3) return undefined;
      try{
        const entries = await fs.readdir(dir, { withFileTypes:true });
        for(const e of entries){
          const p = path.join(dir, e.name);
          if(e.isFile()){
            if(e.name.toLowerCase() === (tool+ext).toLowerCase()) return p;
            if(process.platform==='win32' && e.name.toLowerCase().endsWith('.exe')){
              // prefer a matching name, but accept any exe as fallback
              return p;
            }
          } else if(e.isDirectory()){
            const found = await findExecutable(p, depth+1);
            if(found) return found;
          }
        }
      }catch(_){ }
      return undefined;
    }
    const discovered = await findExecutable(baseDir, 0);
    if(discovered) resolved = discovered; else throw new Error(`Executable not found: ${resolved}`);
  }

  const p = spawn(resolved, args, { cwd: path.dirname(resolved) });
  // wait for spawn or error to avoid uncaught exceptions
  await new Promise<void>((resolve, reject)=>{
    const onError = (err:any)=>{ appendLog(tool, `[ERR] Spawn error: ${String(err)}`); cleanup(); reject(err); };
    const onSpawn = ()=>{ cleanup(); resolve(); };
    const cleanup = ()=>{ p.removeListener('error', onError); p.removeListener('spawn', onSpawn); };
    p.once('error', onError);
    p.once('spawn', onSpawn);
  });

  procs[tool] = { proc: p, logs: [] } as ToolProc;

  p.stdout.on('data', (data) => {
    const line = data.toString().trim();
    appendLog(tool, `[OUT] ${line}`);
  });
  p.stderr.on('data', (data) => {
    const line = data.toString().trim();
    appendLog(tool, `[ERR] ${line}`);
  });
  p.on('exit', (code, signal) => {
    appendLog(tool, `Process exited code=${code} signal=${signal}`);
    delete procs[tool];
  });

  appendLog(tool, `Started ${tool} at ${new Date().toISOString()}`);
}

export async function stopToolProcess(tool: string) {
  const entry = procs[tool];
  if (!entry) throw new Error('Not running');
  entry.proc.kill();
  appendLog(tool, `Stop requested ${tool} at ${new Date().toISOString()}`);
}

export async function getToolLogs(tool: string): Promise<string[]> {
  // return combined persisted file tail + in-memory
  try {
    const dir = await ensureLogDir();
    const file = path.join(dir, `${tool}.log`);
    let fileContents = '';
    try { fileContents = await fs.readFile(file, 'utf-8'); } catch (e) { /* ignore */ }
    const lines = fileContents.split('\n').filter(Boolean);
    const mem = procs[tool]?.logs || [];
    // return last 500 lines combined
    const combined = [...lines, ...mem];
    return combined.slice(-500);
  } catch (e) {
    return procs[tool]?.logs || [];
  }
}

export function isRunning(tool: string) {
  return !!procs[tool];
}

export default { startToolProcess, stopToolProcess, getToolLogs, isRunning };
