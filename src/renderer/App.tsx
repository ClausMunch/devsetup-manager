import React, { useEffect, useState } from 'react';

type Tool = {
  name: string;
  displayName: string;
  versions: {
    version: string;
    platforms: {
      windows?: {
        arch: {
          x64?: {
            downloadUrl: string;
            checksum?: string;
          };
        };
      };
      darwin?: {
        arch: {
          x64?: {
            downloadUrl: string;
          };
          arm64?: {
            downloadUrl: string;
          };
        };
      };
      linux?: {
        arch: {
          x64?: {
            downloadUrl: string;
          };
        };
      };
    };
  }[];
};

declare global {
  interface Window {
    electronAPI: {
      fetchTools: () => Promise<{ tools: Tool[] }>;
    };
  }
}

export default function App() {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    console.log('App component mounted');
    const GIST_URL = 'https://gist.githubusercontent.com/ClausMunch/04bfece83f9d534aa87691dcd17abbcb/raw/tools.json';

    const directFetch = async () => {
      try {
        console.log('Attempting direct fetch from renderer');
        const res = await fetch(GIST_URL);
        if (!res.ok) throw new Error('Direct fetch failed');
        const data = await res.json();
        console.log('Direct fetch result:', data);
        setTools(data.tools || []);
      } catch (err) {
        console.error('Direct fetch error', err);
      }
    };

    if (!window.electronAPI) {
      console.warn('window.electronAPI is undefined — using direct fetch fallback');
      directFetch();
      return;
    }

    window.electronAPI.fetchTools()
      .then(data => {
        console.log('Fetched data via IPC:', data);
        setTools(data.tools || []);
      })
      .catch(err => {
        console.error('IPC fetch failed, falling back to direct fetch', err);
        directFetch();
      });
  }, []);

  console.log('Rendering App with tools:', tools);

  return (
    <div style={{ padding: 20 }}>
      <h1>DevSetup Manager</h1>
      {tools.length === 0 ? (
        <p>Loading tools...</p>
      ) : (
        tools.map(tool => (
          <div key={tool.name} style={{ marginBottom: '1rem' }}>
            <h2>{tool.displayName}</h2>
            <ul>
              {tool.versions.map(v => (
                <li key={v.version}>
                  Version: {v.version}
                  <ul>
                    {v.platforms.windows && (
                      <li>Windows: <a href={v.platforms.windows.arch.x64?.downloadUrl} target="_blank">Download</a></li>
                    )}
                    {v.platforms.darwin && (
                      <>
                        {v.platforms.darwin.arch.x64 && <li>macOS Intel: <a href={v.platforms.darwin.arch.x64.downloadUrl} target="_blank">Download</a></li>}
                        {v.platforms.darwin.arch.arm64 && <li>macOS Apple Silicon: <a href={v.platforms.darwin.arch.arm64.downloadUrl} target="_blank">Download</a></li>}
                      </>
                    )}
                    {v.platforms.linux && (
                      <li>Linux: <a href={v.platforms.linux.arch.x64?.downloadUrl} target="_blank">Download</a></li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
