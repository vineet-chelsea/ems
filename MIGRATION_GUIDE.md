# Migration Guide: Frontend to Backend API

## Summary of Changes

The application has been migrated from using mock/frontend data to a full backend API with PostgreSQL database.

## What Changed

### ✅ Removed
- Mock device data (`mockDevices` array in `EnergyDashboard.tsx`)
- Frontend-only data storage
- Simulated device connections

### ✅ Added
- Backend API (Express + TypeScript)
- PostgreSQL database (Dockerized)
- Dynamic table creation per device
- Automatic table cleanup
- REST API endpoints
- API service layer in frontend

## New Architecture

```
Frontend (React/Electron)
    ↓ HTTP API calls
Backend API (Express)
    ↓ SQL queries
PostgreSQL Database
    ├── devices table (metadata)
    ├── device_<id1> table (time-series data)
    ├── device_<id2> table (time-series data)
    └── ...
```

## Key Features

### 1. Dynamic Table Management
- Each device gets its own table: `device_<device_id>`
- Tables are created automatically when devices are added
- Tables are deleted automatically when devices are removed
- Orphaned tables are cleaned up on startup

### 2. Comprehensive Data Storage
Each device table stores:
- **Voltage**: VR, VY, VB, V1, V2, V3, V, Vavg, Vpeak
- **Current**: IR, IY, IB, I1, I2, I3, I, Iavg, Ipeak
- **Power**: P1, P2, P3, Ptotal, Q1-Q3, Qtotal, S1-S3, Stotal
- **Power Factor**: PF1, PF2, PF3, PFavg, PF
- **Frequency**: frequency
- **Energy**: energy_active, energy_reactive, energy_apparent
- **Harmonics**: THD_V1-V3, THD_I1-I3, THD_V, THD_I
- **Additional**: temperature, humidity
- **Timestamp**: Automatic timestamp for each data point

### 3. API Endpoints

**Devices:**
- `GET /api/devices` - List all devices
- `GET /api/devices/:id` - Get device details
- `POST /api/devices` - Create device
- `PUT /api/devices/:id` - Update device
- `DELETE /api/devices/:id` - Delete device
- `PATCH /api/devices/:id/status` - Update status

**Data:**
- `POST /api/data/:deviceId` - Insert data point
- `GET /api/data/:deviceId` - Get data (with filters)
- `GET /api/data/:deviceId/latest` - Get latest reading
- `GET /api/data/:deviceId/stats` - Get statistics

## Frontend Changes

### API Service (`src/services/api.ts`)
New service layer that handles all API communication:
```typescript
import { api } from '@/services/api';

// Get devices
const devices = await api.getDevices();

// Create device
const device = await api.createDevice({...});

// Insert data
await api.insertDataPoint(deviceId, { V1: 230.5, ... });
```

### EnergyDashboard Updates
- Removed `mockDevices` array
- Added `useEffect` to fetch devices from API
- Added polling to refresh device data every 5 seconds
- Updated `handleAddDevice` to use API
- Updated `handleDeleteDevice` to use API
- Fetches latest data for each device to show parameters

## Backend Structure

```
backend/
├── src/
│   ├── index.ts              # Express server
│   ├── db/
│   │   ├── connection.ts     # PostgreSQL connection
│   │   ├── schema.ts         # Database schema
│   │   └── tableManager.ts  # Dynamic table management
│   └── routes/
│       ├── devices.ts        # Device endpoints
│       └── data.ts           # Data endpoints
├── package.json
└── tsconfig.json
```

## Docker Setup

`docker-compose.yml` includes:
- PostgreSQL 16 (Alpine)
- Backend API (Node.js)
- Automatic health checks
- Volume persistence

## Development Workflow

1. **Start Docker containers:**
   ```bash
   docker-compose up -d
   ```

2. **Start backend (dev mode):**
   ```bash
   cd backend
   npm run dev
   ```

3. **Start frontend:**
   ```bash
   npm run electron:dev
   ```

## Production Build

The Electron installer now includes:
- Backend code
- Docker Compose configuration
- Automatic Docker container startup
- Database initialization

When the app launches:
1. Checks for Docker
2. Starts containers automatically
3. Waits for backend to be ready
4. Opens frontend

## Data Migration

If you have existing mock data, you'll need to:
1. Start the backend
2. Re-add devices through the UI
3. Data will be stored in PostgreSQL

## Testing the API

### Using curl:
```bash
# Health check
curl http://localhost:3001/health

# Get devices
curl http://localhost:3001/api/devices

# Create device
curl -X POST http://localhost:3001/api/devices \
  -H "Content-Type: application/json" \
  -d '{"id":"1","name":"Test Device","type":"PM5320","ipAddress":"192.168.1.100","subnetMask":"255.255.255.0"}'

# Insert data
curl -X POST http://localhost:3001/api/data/1 \
  -H "Content-Type: application/json" \
  -d '{"V1":230.5,"V2":231.2,"V3":229.8,"Ptotal":10.5}'
```

## Next Steps

1. **Install dependencies:**
   ```bash
   npm install
   cd backend && npm install
   ```

2. **Start development:**
   ```bash
   docker-compose up -d
   cd backend && npm run dev
   # In another terminal:
   npm run electron:dev
   ```

3. **Build for production:**
   ```bash
   npm run build:win  # or build:mac, build:linux
   ```

## Notes

- All data is now persisted in PostgreSQL
- Device tables are created/deleted automatically
- The frontend polls for updates every 5 seconds
- Docker is required for production (included in installer)
- Backend runs on port 3001
- Database runs on port 5432

