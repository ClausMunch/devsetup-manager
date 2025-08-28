import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

export type AppConfig = {
  baseProjectPath?: string;
  tld?: string;
  ports?: Record<string, number>;
  installedTools?: Record<string, string>;
};

const CONFIG_FILE = path.join(app.getPath('userData'), 'devsetup-config.json');

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as AppConfig;
  } catch (e) {
    return { installedTools: {} };
  }
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  try {
    const dir = path.dirname(CONFIG_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config', e);
  }
}
