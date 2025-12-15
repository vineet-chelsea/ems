# Backend Setup Guide

## Overview

The Energy Monitoring System now includes a backend API with PostgreSQL database, running in Docker containers. The backend automatically:
- Creates a table for each device
- Deletes tables for removed devices
- Stores time-series data with timestamps
- Provides REST API endpoints for frontend

## Architecture

```
┌─────────────────┐
│  Electron App   │
│   (Frontend)    │
└────────┬────────┘
         │ HTTP API
         ▼
┌─────────────────┐
│  Backend API    │
│   (Express)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   (Docker)      │
└─────────────────┘
```

## Database Schema

### Devices Table
Stores device metadata:
- `id` (VARCHAR) - Primary key
- `name`, `type`, `ip_address`, `subnet_mask`
- `status`, `last_seen`, `include_in_total_summary`

### Device Data Tables
Each device gets its own table: `device_<device_id>`

Columns include:
- `timestamp` - When the data was recorded
- **Voltage**: VR, VY, VB, V1, V2, V3, V, Vavg, Vpeak
- **Current**: IR, IY, IB, I1, I2, I3, I, Iavg, Ipeak
- **Power**: P1, P2, P3, Ptotal, Q1, Q2, Q3, Qtotal, S1, S2, S3, Stotal
- **Power Factor**: PF1, PF2, PF3, PFavg, PF
- **Frequency**: frequency
- **Energy**: energy_active, energy_reactive, energy_apparent
- **Harmonics**: THD_V1, THD_V2, THD_V3, THD_I1, THD_I2, THD_I3, THD_V, THD_I
- **Additional**: temperature, humidity

## API Endpoints

### Devices
- `GET /api/devices` - Get all devices
- `GET /api/devices/:id` - Get device by ID
- `POST /api/devices` - Create new device
- `PUT /api/devices/:id` - Update device
- `DELETE /api/devices/:id` - Delete device (also deletes its table)
- `PATCH /api/devices/:id/status` - Update device status

### Data
- `POST /api/data/:deviceId` - Insert data point
- `GET /api/data/:deviceId` - Get data points (with query params: startTime, endTime, limit, offset)
- `GET /api/data/:deviceId/latest` - Get latest data point
- `GET /api/data/:deviceId/stats` - Get aggregated statistics

### Health
- `GET /health` - Health check endpoint

## Development Setup

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- npm or yarn

### Steps

1. **Install Backend Dependencies**
```bash
cd backend
npm install
```

2. **Start Docker Containers**
```bash
# From project root
docker-compose up -d
```

This starts:
- PostgreSQL database (port 5432)
- Backend API (port 3001)

3. **Run Backend in Development**
```bash
cd backend
npm run dev
```

4. **Run Frontend**
```bash
# From project root
npm run electron:dev
```

## Production Build

The Electron installer includes:
- Backend code
- Docker Compose configuration
- Database initialization

When the app starts:
1. Checks if Docker is installed
2. Starts Docker containers automatically
3. Waits for backend to be ready
4. Opens the frontend

## Environment Variables

### Backend (.env)
```
DB_HOST=postgres
DB_PORT=5432
DB_NAME=ems_db
DB_USER=ems_user
DB_PASSWORD=ems_password
PORT=3001
NODE_ENV=production
```

### Frontend
Set `VITE_API_URL` in `.env` or environment:
```
VITE_API_URL=http://localhost:3001/api
```

## Data Flow

1. **Device Creation**:
   - Frontend calls `POST /api/devices`
   - Backend creates device record
   - Backend creates `device_<id>` table
   - Returns device info

2. **Data Insertion**:
   - Device sends data to `POST /api/data/:deviceId`
   - Backend inserts into `device_<deviceId>` table
   - Returns confirmation

3. **Data Retrieval**:
   - Frontend calls `GET /api/data/:deviceId`
   - Backend queries device table
   - Returns time-series data

4. **Device Deletion**:
   - Frontend calls `DELETE /api/devices/:id`
   - Backend deletes device record
   - Backend drops `device_<id>` table
   - Cleanup complete

## Automatic Cleanup

The backend automatically:
- Creates tables when devices are added
- Deletes tables when devices are removed
- Cleans up orphaned tables on startup (tables without corresponding devices)

## Troubleshooting

### Backend won't start
- Check Docker is running: `docker ps`
- Check containers: `docker-compose ps`
- Check logs: `docker-compose logs backend`
- Check database: `docker-compose logs postgres`

### Database connection errors
- Verify PostgreSQL container is running
- Check environment variables in `.env`
- Check database credentials match docker-compose.yml

### Tables not created
- Check backend logs for errors
- Verify device was created successfully
- Check database permissions

### Data not appearing
- Verify data is being sent to correct endpoint
- Check device ID matches
- Verify table exists: `SELECT * FROM device_<id> LIMIT 1;`

## Manual Database Access

```bash
# Connect to PostgreSQL
docker exec -it ems_postgres psql -U ems_user -d ems_db

# List all tables
\dt

# Query device data
SELECT * FROM device_<device_id> ORDER BY timestamp DESC LIMIT 10;
```

## Backup and Restore

### Backup
```bash
docker exec ems_postgres pg_dump -U ems_user ems_db > backup.sql
```

### Restore
```bash
docker exec -i ems_postgres psql -U ems_user ems_db < backup.sql
```

