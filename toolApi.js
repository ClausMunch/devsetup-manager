export async function fetchTools() {
    const GIST_URL = 'https://gist.githubusercontent.com/ClausMunch/04bfece83f9d534aa87691dcd17abbcb/raw/tools.json';
    const res = await fetch(GIST_URL);
    if (!res.ok)
        throw new Error('Failed to fetch tools');
    const text = await res.text();
    try {
        return JSON.parse(text);
    }
    catch (err) {
        console.warn('tools.json parse failed, attempting tolerant parse', err);
        try {
            let cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '');
            cleaned = cleaned.replace(/\/\/.*$/gm, '');
            const firstBrace = Math.min(...['{','['].map(ch=>{const i=cleaned.indexOf(ch); return i===-1?Number.MAX_SAFE_INTEGER:i;}));
            const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
            if (firstBrace !== Number.MAX_SAFE_INTEGER && lastBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.slice(firstBrace, lastBrace+1);
            }
            cleaned = cleaned.replace(/,\s*(?=[}\]])/g, '');
            return JSON.parse(cleaned);
        }
        catch (err2) {
            console.error('Tolerant parse failed for tools.json; raw response logged');
            console.error(text.slice(0, 5000));
            // fallback: try to read local tools.json from disk
            try {
                const fsp = await import('fs/promises');
                const localPath = new URL('./tools.json', import.meta.url);
                const localRaw = await fsp.readFile(localPath, 'utf-8');
                return JSON.parse(localRaw);
            }
            catch (localErr) {
                console.error('Local tools.json fallback failed', localErr);
                throw err2;
            }
        }
    }
}
