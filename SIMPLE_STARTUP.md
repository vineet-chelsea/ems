# Simple Startup Guide

## Quick Start (Automated) ⚡

### Option 1: Command Line (Recommended)
```powershell
npm run start:dev
```

This will automatically:
- Check prerequisites (Node.js, PostgreSQL, ports)
- Build backend if needed
- Start backend in one window
- Start frontend (Electron) in another window
- Open the Electron app automatically

### Option 2: Manual (Step by Step)

#### 1. Start Backend
```powershell
cd backend
npm run start
```

#### 2. Start Frontend (Electron)
In a new terminal:
```powershell
npm run dev:electron
```

That's it! Both will start and the Electron app will open automatically.

## Prerequisites

- **PostgreSQL** must be running on `localhost:5432`
- **Database** `ems_db` must exist
- **User** `ems_user` with password `ems_password` must exist

## What Each Command Does

### Backend (`npm run start`)
- Runs the compiled backend from `backend/dist/index.js`
- Connects to PostgreSQL on `localhost:5432`
- Starts API server on `http://localhost:3001`

### Frontend (`npm run dev:electron`)
- Starts Vite dev server on `http://localhost:5173`
- Waits for Vite to be ready
- Launches Electron app
- Electron connects to Vite dev server (hot reload enabled)

## First Time Setup

If backend hasn't been built yet:
```powershell
cd backend
npm run build
npm run start
```

## Stop Services

To stop all development services:
```powershell
npm run stop:dev
```

Or manually close the PowerShell windows.

## Troubleshooting

### Backend won't start
- Check PostgreSQL is running: `Get-Service -Name "*postgresql*"`
- Verify database exists: `psql -U postgres -c "\l" | findstr ems_db`
- Check backend logs for connection errors
- The automated script will warn you if PostgreSQL isn't running

### Frontend won't start
- Make sure port 5173 is free
- Check if Vite is already running
- Verify Node.js and npm are installed
- The automated script will warn you if ports are in use

### Port already in use
- Backend uses port 3001
- Frontend uses port 5173
- Use `npm run stop:dev` to kill processes on these ports
- Or manually close the PowerShell windows

### Shortcut not working
- Make sure PowerShell execution policy allows scripts: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- Try running `npm run create-shortcut` again
- Check that the shortcut path is correct

