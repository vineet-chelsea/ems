# Energy Monitoring System - Build Instructions

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

## Installation

1. Install all dependencies:
```bash
npm install
```

## Development

### Run in Development Mode

To run the application in development mode with hot-reload:

```bash
npm run electron:dev
```

This will:
- Start the Vite dev server on http://localhost:8080
- Launch Electron when the server is ready
- Enable hot-reload for both React and Electron

### Run Web Version Only

To run just the web version (without Electron):

```bash
npm run dev
```

## Building for Production

### Build for Windows

Creates a Windows installer (NSIS) in the `release` folder:

```bash
npm run build:win
```

This creates:
- `release/Energy Monitoring System Setup x.x.x.exe` - Installer executable
- `release/win-unpacked/` - Unpacked application folder

### Build for macOS

Creates a macOS DMG file:

```bash
npm run build:mac
```

### Build for Linux

Creates Linux AppImage and DEB packages:

```bash
npm run build:linux
```

### Build for Current Platform

Builds for the platform you're currently on:

```bash
npm run build
```

## Installation

### Windows

1. Run the installer: `Energy Monitoring System Setup x.x.x.exe`
2. Follow the installation wizard
3. Choose installation directory (optional)
4. Select desktop and start menu shortcuts (optional)
5. Complete installation

The application will be installed and can be launched from:
- Desktop shortcut (if selected)
- Start Menu
- Installation directory

### macOS

1. Open the DMG file
2. Drag the application to Applications folder
3. Launch from Applications

### Linux

**AppImage:**
1. Make the AppImage executable: `chmod +x Energy-Monitoring-System-x.x.x.AppImage`
2. Run: `./Energy-Monitoring-System-x.x.x.AppImage`

**DEB Package:**
1. Install: `sudo dpkg -i energy-monitoring-system_x.x.x_amd64.deb`
2. Launch from applications menu

## Auto-Start on System Startup

The application includes an auto-start feature that can be enabled from the Settings tab:

1. Open the application
2. Log in as admin
3. Go to the "Settings" tab
4. Toggle "Launch on System Startup" to enable/disable

This will automatically start the application when you log in to your computer.

## Auto-Update (GitHub Releases - Currently Disabled)

The auto-update functionality is currently commented out. To enable it:

1. **Configure GitHub Releases:**
   - Update `package.json` → `build.publish` section with your GitHub username and repo name
   - Set up GitHub Personal Access Token with `repo` scope
   - Create releases on GitHub with version tags (e.g., `v1.0.0`)

2. **Uncomment Auto-Updater Code:**
   - `electron/main.ts` - Uncomment all auto-updater related code
   - `electron/preload.ts` - Uncomment update-related IPC handlers
   - `src/components/AutoUpdate.tsx` - Uncomment update checking and installation methods

3. **Build and Release:**
   - Build the application: `npm run build:win` (or mac/linux)
   - Create a GitHub release with the built files
   - The auto-updater will check for updates from GitHub releases

## Project Structure

```
ems/
├── electron/              # Electron main process files
│   ├── main.ts           # Main Electron process
│   └── preload.ts        # Preload script (IPC bridge)
├── src/                  # React application source
│   ├── components/       # React components
│   │   ├── AutoUpdate.tsx
│   │   └── AutoStartSettings.tsx
│   └── types/            # TypeScript type definitions
│       └── electron.d.ts
├── dist/                 # Built React app (created on build)
├── dist-electron/        # Built Electron files (created on build)
├── release/              # Final packaged executables (created on build)
└── package.json          # Dependencies and build configuration
```

## Troubleshooting

### Build Fails

- Ensure all dependencies are installed: `npm install`
- Check Node.js version: `node --version` (should be 18+)
- Clear build artifacts: Delete `dist`, `dist-electron`, and `release` folders

### Application Won't Start

- Check Electron installation: `npm list electron`
- Verify preload script exists: `dist-electron/preload.js`
- Check main process file: `dist-electron/main.js`

### Auto-Start Not Working

- On Windows: Check Task Manager → Startup tab
- On macOS: Check System Preferences → Users & Groups → Login Items
- On Linux: Check autostart directory: `~/.config/autostart/`

### Icons Missing

Create icon files in `build/` directory:
- `build/icon.ico` (Windows)
- `build/icon.icns` (macOS)
- `build/icon.png` (Linux)

## Notes

- The application uses localStorage for data persistence
- All user data is stored locally in the application's user data directory
- The installer creates shortcuts and can be uninstalled via Windows Settings (Windows) or by dragging to Trash (macOS)

