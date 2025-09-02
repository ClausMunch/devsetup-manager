// =========================================================
// 🖥️ DevSetup Manager – Electron + React + TypeScript App
// =========================================================
//
// A local development tool like Laragon or DSM,
// built in Electron. Supports starting/stopping dev tools
// like PHP, Nginx, MariaDB, and Mailpit.
// 
// Key Features:
// - Dynamic download/install of tools (via JSON source/Gist)
// - Process management (start/stop/status)
// - Auto-detection of web projects (e.g., in `~/Sites`)
// - Virtual host config for `.test` domains
// - Config UI for ports, paths, versions
// - Logs viewer for each tool
//
// =========================================================
// Project Structure (VSCode)
// =========================================================
//
// /src
// ├── /main             ← Electron main process
// │   ├── appManager.ts         # Controls tool start/stop
// │   ├── configService.ts      # Loads and saves settings
// │   ├── nginxConfigurator.ts  # Writes vhost files
// │   ├── projectScanner.ts     # Detects projects in base dir
// │   └── toolInstaller.ts      # Downloads and installs tools
// ├── /renderer         ← React UI
// │   ├── App.tsx               # Main layout
// │   ├── /pages
// │   │   ├── Dashboard.tsx
// │   │   ├── Tools.tsx
// │   │   └── Projects.tsx
// │   └── /components
// ├── /types            ← Shared TypeScript types
// └── /config           ← Templates (e.g., nginx.conf)
//
// =========================================================
// Key Components
// =========================================================

// ==========================
// 1. Tool Metadata (from Gist)
// ==========================
//
// tools.json format (from a public Gist):
//
// {
//   "tools": [
//     {
//       "name": "nginx",
//       "displayName": "Nginx",
//       "versions": [
//         {
//           "version": "1.25.2",
//           "platforms": {
//             "windows": {
//               "arch": {
//                 "x64": {
//                   "downloadUrl": "https://example.com/nginx-win64.zip",
//                   "checksum": "abc123"
//                 }
//               }
//             }
//           }
//         }
//       ]
//     }
//   ]
// }
//
// Fetched at app startup or manually refreshed.


// ==========================
// 2. Tool Installer
// ==========================
//
// Downloads tool binaries and extracts to install directory.
// - Uses `node-fetch` + `extract-zip`
// - Validates checksum (optional)
// - Installs to: `${appData}/devsetup/tools/<tool>/<version>/`
//
// Example method:
// installTool(toolName: string, version: string): Promise<void>


// ==========================
// 3. App Manager (Process Control)
// ==========================
//
// Start/stop/manage processes using `child_process.spawn`.
// Tracks status and logs output.
//
// Supported tools:
// - Nginx (via `nginx.exe -c <conf>`) 
// - PHP-FPM (optional)
// - MariaDB
// - Mailpit (single binary)
// 
// Methods:
// - startTool(name: string): Promise<void>
// - stopTool(name: string): Promise<void>
// - isRunning(name: string): boolean


// ==========================
// 4. Configuration Service
// ==========================
//
// Reads/writes a local JSON file for persistent config.
//
// config.json structure:
// {
//   baseProjectPath: "C:/Sites",
//   tld: ".test",
//   ports: {
//     nginx: 80,
//     mariadb: 3306
//   },
//   installedTools: { php: "8.3.1", nginx: "1.25.2" }
// }
//
// Methods:
// - loadConfig(): AppConfig
// - saveConfig(config: AppConfig): void


// ==========================
// 5. Nginx Configurator
// ==========================
//
// Dynamically generates Nginx config and virtual host files.
//
// - Scans baseProjectPath
// - Maps each folder to: http://<folder>.test
// - Writes virtual host files for each
// - Uses nginx.conf template with `include vhosts/*.conf`
//
// Example:
// Folder: C:/Sites/my-app → http://my-app.test
//
// Methods:
// - generateVhosts(): void
// - reloadNginx(): void


// ==========================
// 6. Project Scanner
// ==========================
//
// Scans configured base directory and returns a list of projects.
//
// Methods:
// - getProjects(): Project[] // returns [{ name, path, url }]
//
// React can then display links to http://<name>.test


// ==========================
// 7. Renderer UI (React)
// ==========================
//
// Pages:
// - Dashboard: Status of tools, quick controls
// - Tools: Install/switch versions, update tools
// - Projects: List .test sites, open in browser
// - Settings: Base path, ports, .test TLD
// - Logs: Tail output of each tool (nginx, db, mailpit)
//
// Use Tailwind or Chakra UI for layout.


/**
 * ToolStatus type example:
 */
type ToolStatus = 'installed' | 'running' | 'stopped' | 'not_installed';

interface InstalledTool {
  name: string;
  version: string;
  status: ToolStatus;
  path: string;
}

/**
 * Project type example:
 */
interface Project {
  name: string;
  path: string;
  url: string; // http://my-app.test
}


// ==========================
// 8. System Tray Integration (optional)
// ==========================
//
// - Show quick status of tools
// - Right-click menu: start/stop all, open settings
// - Run app in background on boot (optional)


// ==========================
// 9. Download & Update Flow
// ==========================
//
// - Fetch tools.json from Gist
// - Display available versions in Tools UI
// - Install to per-version folders
// - Allow switching active version
// - If version installed: mark as `installed`
// - If running: mark as `running`


// ==========================
// 10. Security & System Notes
// ==========================
//
// - App should not require admin privileges
// - Nginx should run on a user-configured port (default: 80)
// - All binaries should be signed or checksum-verified
// - Tool processes should be isolated
// - Avoid modifying system PATH or global envs


// ==========================
// 11. Future Extensions
// ==========================
//
// - Custom tool definitions
// - Support for Linux/macOS as well
// - Add embedded terminal (xterm.js)
// - Support Docker as backend (optional)
// - Plugin system for new tools (Node.js based)
//
// END OF DESIGN DOCUMENT
