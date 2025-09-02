import { ipcMain } from 'electron';
import * as path from 'path';

// Returns all subdirectories in a given directory
export function registerListDirectoriesHandler() {
  ipcMain.handle('list-directories', async (_e, dirPath) => {
    try {
      const fsp = await import('fs/promises');
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => path.join(dirPath, e.name));
    } catch (e) {
      return [];
    }
  });
}
