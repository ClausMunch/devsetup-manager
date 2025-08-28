import { app } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

type ToolProc = {
  proc: ChildProcessWithoutNullStreams;
  logs: string[];
};

const procs: Record<string, ToolProc> = {};

async function ensureLogDir() {
  const dir = path.join(app.getPath('userData'), 'logs');
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
  const p = spawn(execPath, args, { cwd: path.dirname(execPath) });
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
