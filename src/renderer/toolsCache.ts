// Simple cache for tools.json fetched from Gist
// Usage: import { getCachedToolsJson } from './toolsCache';
// getCachedToolsJson().then(data => ...)

const GIST_URL = 'https://gist.githubusercontent.com/ClausMunch/04bfece83f9d534aa87691dcd17abbcb/raw/tools.json';
const CACHE_KEY = 'tools_json_cache_v1';
const CACHE_TIME_MS = 1000 * 60 * 60; // 1 hour

export async function getCachedToolsJson(forceRefresh = false) {
  const now = Date.now();
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached && !forceRefresh) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      if (now - timestamp < CACHE_TIME_MS) {
        return data;
      }
    } catch {}
  }
  // Fetch from network
  const res = await fetch(GIST_URL);
  if (!res.ok) throw new Error('Failed to fetch tools.json');
  const data = await res.json();
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: now }));
  return data;
}
