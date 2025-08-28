import { app } from 'electron';
import * as path from 'path';

export function getBaseDir() {
  // On Windows use %USERPROFILE%\.config\devsetup-manager, otherwise default to Electron userData
  if (process.platform === 'win32') {
    const userProfile = process.env.USERPROFILE || app.getPath('home') || app.getPath('userData');
    return path.join(userProfile, '.config', 'devsetup-manager');
  }
  return app.getPath('userData');
}

export function getBinDir() {
  return path.join(getBaseDir(), 'bin');
}

export function getConfigDir() {
  return path.join(getBaseDir(), 'config');
}

export function getNginxConfigDir() {
  return path.join(getConfigDir(), 'nginx');
}

export function getPhpConfigDir() {
  return path.join(getConfigDir(), 'php');
}

export function getLogDir() {
  return path.join(getBaseDir(), 'Log');
}
