import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchTools } from './toolApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

app.whenReady().then(() => {
  console.log('App ready, setting up IPC');
  ipcMain.handle('fetch-tools', async () => {
    console.log('IPC fetch-tools called');
    try {
      const result = await fetchTools();
      console.log('Fetch result:', result);
      return result;
    } catch (error) {
      console.error('Error in fetch-tools:', error);
      throw error;
    }
  });
  createWindow();
});
