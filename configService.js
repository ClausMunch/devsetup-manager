import * as fs from 'fs/promises';
import * as path from 'path';
import { getBaseDir } from './pathService.js';
const CONFIG_FILE = path.join(getBaseDir(), 'devsetup-config.json');
export async function loadConfig() {
    try {
        const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(raw);
    }
    catch (e) {
        return { installedTools: {} };
    }
}
export async function saveConfig(cfg) {
    try {
        const dir = path.dirname(CONFIG_FILE);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    }
    catch (e) {
        console.error('Failed to save config', e);
    }
}
