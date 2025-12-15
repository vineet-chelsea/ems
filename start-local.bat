@echo off
REM Quick start script for local development (Windows)

REM Change to script directory (project root)
cd /d "%~dp0"

echo Starting EMS for local development...
echo Current directory: %CD%
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo Docker is not running. Please start Docker Desktop first.
    exit /b 1
)

REM Start services with local configuration
echo Starting Docker services (local config)...
docker-compose -f docker-compose.local.yml up -d

REM Wait for services to be ready
echo Waiting for services to be ready...
timeout /t 5 /nobreak >nul

REM Check service status
echo.
echo Service Status:
docker-compose -f docker-compose.local.yml ps

echo.
echo Services started!
echo.
echo Access points:
echo    - Backend API: http://localhost:3001
echo    - Kafka UI: http://localhost:8081
echo.
echo To view logs: docker-compose -f docker-compose.local.yml logs -f
echo To stop: docker-compose -f docker-compose.local.yml down

pause

