import { app } from 'electron';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import https from 'https';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';

export async function downloadWithProgress(url: string, dest: string, onProgress?: (percent:number)=>void) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  return new Promise<string>((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode && res.statusCode >= 400) return reject(new Error('Download failed: ' + res.statusCode));
      const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
      let received = 0;
      const file = fs.createWriteStream(dest);
      res.on('data', chunk => { received += chunk.length; if (total && onProgress) onProgress(Math.round((received/total)*100)); });
      res.pipe(file);
      file.on('finish', ()=>{ file.close(); resolve(dest); });
      res.on('error', err=>{ fs.unlink(dest, ()=>{}); reject(err); });
    }).on('error', err=> reject(err));
  });
}

export async function verifyChecksum(filePath:string, expected:string){
  const algo = expected.startsWith('sha256:') ? 'sha256' : 'sha256';
  const exp = expected.replace(/^sha256:/,'')
  const hash = crypto.createHash(algo);
  return new Promise<boolean>((resolve,reject)=>{
    const rs = fs.createReadStream(filePath);
    rs.on('data', d=>hash.update(d));
    rs.on('end', ()=>{ const got = hash.digest('hex'); resolve(got === exp); });
    rs.on('error', e=>reject(e));
  });
}

async function tryExtract(filePath:string,destDir:string){
  try{
    if(filePath.endsWith('.zip')){
      const extract = (await import('extract-zip')).default;
      await extract(filePath,{dir:destDir});
      return true;
    }
    if(filePath.endsWith('.tar.gz')||filePath.endsWith('.tgz')){
      const tar = await import('tar');
      await tar.x({file:filePath,cwd:destDir});
      return true;
    }
  }catch(e){ console.warn('Extraction failed',e); }
  return false;
}

export async function installTool(toolName: string, version: string, downloadUrl: string, checksum?: string, onProgress?: (p:number)=>void) {
  const folder = `tools/${toolName}/${version}`;
  const fileName = path.basename(downloadUrl).split('?')[0];
  const destPath = path.join(app.getPath('userData'), folder, fileName);
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  await downloadWithProgress(downloadUrl, destPath, onProgress);
  if(checksum){ const ok = await verifyChecksum(destPath, checksum); if(!ok) throw new Error('Checksum mismatch'); }
  const destDir = path.join(app.getPath('userData'), folder);
  await tryExtract(destPath,destDir);
  return destPath;
}
