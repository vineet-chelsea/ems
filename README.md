# Energy Monitoring System

A desktop application for monitoring and managing energy devices (PM5320 power meters) with real-time data visualization, user management, and reporting capabilities.

## Features

- 🖥️ **Desktop Application** - Native Electron app for Windows, macOS, and Linux
- 📦 **Installer Support** - Create installers for easy distribution
- 🔄 **Auto-Update** - GitHub releases integration (currently commented, ready to enable)
- 🚀 **Auto-Start** - Launch on system startup option
- 👥 **User Management** - Role-based access control (Admin/User)
- 📊 **Real-time Monitoring** - Live parameter charts and power quality metrics
- 📈 **Reporting** - Generate reports in PDF, CSV, and Excel formats
- 🔐 **Secure Authentication** - Password management and recovery

## Quick Start

### Local Development (Recommended for Testing)

**⚠️ Important**: The production config requires 64GB RAM. For local testing, use the local configuration:

```bash
# Start backend services (local config - scaled down)
docker-compose -f docker-compose.local.yml up -d

# Install frontend dependencies
npm install

# Run Electron app in development mode
npm run electron:dev
```

See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for local setup details.

### Production Setup (High-Performance Server)

For production servers with 64GB+ RAM:

```bash
# Start all services (production config)
docker-compose up -d

# Build and run Electron app
npm run build:win  # or build:mac, build:linux
```

### Build for Production

```bash
# Build for Windows (creates installer)
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux
```

See [BUILD_INSTRUCTIONS.md](./BUILD_INSTRUCTIONS.md) for detailed build and installation instructions.

## Project Structure

```
ems/
├── electron/              # Electron main process
│   ├── main.ts           # Main process (auto-update, auto-launch)
│   └── preload.ts        # IPC bridge
├── src/                  # React application
│   ├── components/       # UI components
│   ├── contexts/         # React contexts (Auth)
│   └── pages/            # Page components
└── build/                # App icons (create this folder)
```

## Auto-Update Setup (GitHub Releases)

The auto-update functionality is currently commented out. To enable:

1. Update `package.json` → `build.publish` with your GitHub details
2. Uncomment auto-updater code in:
   - `electron/main.ts`
   - `electron/preload.ts`
   - `src/components/AutoUpdate.tsx`
3. Create GitHub releases with version tags

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/6606e9eb-6051-4057-95ad-346d3203f990) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/6606e9eb-6051-4057-95ad-346d3203f990) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
