import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as https from 'https';
import * as crypto from 'crypto';
import { getBinDir, getConfigDir, getNginxConfigDir, getPhpConfigDir } from './pathService.js';
import * as os from 'os';
export async function downloadWithProgress(url, dest, onProgress) {
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode && res.statusCode >= 400)
                return reject(new Error('Download failed: ' + res.statusCode));
            const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
            let received = 0;
            const file = fs.createWriteStream(dest);
            res.on('data', chunk => { received += chunk.length; if (total && onProgress)
                onProgress(Math.round((received / total) * 100)); });
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(dest); });
            res.on('error', err => { fs.unlink(dest, () => { }); reject(err); });
        }).on('error', err => reject(err));
    });
}
// small helper to sleep
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
export async function verifyChecksum(filePath, expected) {
    const algo = expected.startsWith('sha256:') ? 'sha256' : 'sha256';
    const exp = expected.replace(/^sha256:/, '');
    const hash = crypto.createHash(algo);
    return new Promise((resolve, reject) => {
        const rs = fs.createReadStream(filePath);
        rs.on('data', d => hash.update(d));
        rs.on('end', () => { const got = hash.digest('hex'); resolve(got === exp); });
        rs.on('error', e => reject(e));
    });
}
async function tryExtract(filePath, destDir) {
    // Extract to a temp dir then move into place to avoid partially extracted state and reduce locks
    const tmpDir = path.join(os.tmpdir(), `devsetup-extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            await fsp.mkdir(tmpDir, { recursive: true });
            if (filePath.endsWith('.zip')) {
                const mod = await import('extract-zip');
                const extract = (mod && (mod.default || mod));
                await extract(filePath, { dir: tmpDir });
            }
            else if (filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz')) {
                const tar = await import('tar');
                await tar.x({ file: filePath, cwd: tmpDir });
            }
            else {
                // not an archive: copy the file into tmpDir
                const destFile = path.join(tmpDir, path.basename(filePath));
                await fsp.copyFile(filePath, destFile);
            }
            // move tmpDir contents into destDir
            await fsp.mkdir(destDir, { recursive: true });
            const entries = await fsp.readdir(tmpDir);
            for (const e of entries) {
                const src = path.join(tmpDir, e);
                const dst = path.join(destDir, e);
                // try rename, fallback to copy
                try {
                    await fsp.rename(src, dst);
                }
                catch (_) {
                    await fsp.copyFile(src, dst);
                }
            }
            // cleanup tmp
            try {
                await fsp.rm(tmpDir, { recursive: true, force: true });
            }
            catch (_) { }
            return true;
        }
        catch (err) {
            console.warn('Extraction attempt failed', attempt, err);
            // if locked, wait and retry
            await delay(250 * (attempt + 1));
            continue;
        }
    }
    return false;
}
export async function installTool(toolName, version, downloadUrl, checksum, onProgress) {
    const folder = path.join(getBinDir(), toolName, version);
    const fileName = path.basename(downloadUrl).split('?')[0];
    const destPath = path.join(folder, fileName);
    await fsp.mkdir(path.dirname(destPath), { recursive: true });
    // Report download progress (0-70)
    await downloadWithProgress(downloadUrl, destPath, (pct) => { if (onProgress)
        onProgress(Math.round(pct * 0.7)); });
    if (checksum) {
        const ok = await verifyChecksum(destPath, checksum);
        if (!ok)
            throw new Error('Checksum mismatch');
    }
    const destDir = path.join(getBinDir(), toolName, version);
    // Extraction step (70-100)
    const ok = await tryExtract(destPath, destDir);
    if (!ok)
        throw new Error('Extraction failed');
    if (onProgress)
        onProgress(100);
    // create per-service config dirs
    await fsp.mkdir(getConfigDir(), { recursive: true });
    await fsp.mkdir(getNginxConfigDir(), { recursive: true });
    await fsp.mkdir(getPhpConfigDir(), { recursive: true });
    return destPath;
}
export async function uninstallTool(toolName, version) {
    let base = path.join(getBinDir(), toolName);
    if (version)
        base = path.join(getBinDir(), toolName, version);
    // remove the directory
    await fsp.rm(base, { recursive: true, force: true });
}
