export async function fetchTools() {
    const GIST_URL = 'https://gist.githubusercontent.com/ClausMunch/04bfece83f9d534aa87691dcd17abbcb/raw/tools.json';
    const res = await fetch(GIST_URL);
    if (!res.ok)
        throw new Error('Failed to fetch tools');
    return await res.json();
}
