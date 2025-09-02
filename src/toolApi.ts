export async function fetchTools() {
  const GIST_URL = 'https://gist.githubusercontent.com/ClausMunch/04bfece83f9d534aa87691dcd17abbcb/raw/tools.json';
  const res = await fetch(GIST_URL);
  if (!res.ok) throw new Error('Failed to fetch tools');
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn('tools.json parse failed, attempting tolerant parse', err);
    // Attempt to sanitize common issues: strip comments and trailing commas
    try {
      let cleaned = text.replace(/\/\*[\s\S]*?\*\//g, ''); // remove /* */ comments
      cleaned = cleaned.replace(/\/\/.*$/gm, ''); // remove // comments
      // extract the first JSON object/array block if extra text exists
      const firstBrace = Math.min(
        ...['{','['].map(ch => { const i = cleaned.indexOf(ch); return i===-1?Number.MAX_SAFE_INTEGER:i; })
      );
      const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
      if (firstBrace !== Number.MAX_SAFE_INTEGER && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace+1);
      }
      // remove trailing commas before ] or }
      cleaned = cleaned.replace(/,\s*(?=[}\]])/g, '');
      return JSON.parse(cleaned);
    } catch (err2) {
      console.error('Tolerant parse failed for tools.json; raw response logged');
      console.error(text.slice(0, 5000));
      throw err2;
    }
  }
}
