import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Dynamically load theme CSS (resolve to correct URLs so Vite/Electron can serve them)
const THEME_KEY = 'dsm_theme';
const THEMES = {
  dark: new URL('./herd-theme.css', import.meta.url).href,
  light: new URL('./dsm-theme-light.css', import.meta.url).href,
};

function loadTheme(theme: keyof typeof THEMES) {
  const file = THEMES[theme] || THEMES.dark;
  let link = document.getElementById('dsm-theme-link') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'dsm-theme-link';
    document.head.appendChild(link);
  }
  link.href = file;
  // expose for runtime calls from App
  // @ts-ignore
  window.loadTheme = loadTheme;
}

const savedTheme = (localStorage.getItem(THEME_KEY) || 'dark') as keyof typeof THEMES;
loadTheme(savedTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
