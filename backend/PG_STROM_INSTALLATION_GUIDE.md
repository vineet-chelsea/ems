# PostgreSQL pg_strom Installation Guide

Complete guide to install and configure pg_strom for GPU-accelerated PostgreSQL queries on Windows with NVIDIA RTX 5060 Ti.

## Overview

pg_strom is a PostgreSQL extension that enables GPU acceleration for:
- Large JOIN operations
- Aggregation queries (SUM, AVG, COUNT, etc.)
- Complex WHERE clauses
- Parallel processing of large datasets

**Benefits:**
- 10-100x faster queries on large datasets (>1M rows)
- Automatic GPU offloading for eligible queries
- Works seamlessly with TimescaleDB
- No application code changes required

## Prerequisites

### 1. NVIDIA GPU with CUDA Support
- ✅ You have: NVIDIA RTX 5060 Ti (8GB DDR5)
- CUDA Compute Capability: 8.6+ (RTX 5060 Ti supports this)

### 2. CUDA Toolkit
- Download from: https://developer.nvidia.com/cuda-downloads
- Version: CUDA 11.0 or higher (recommended: CUDA 12.x)
- Install with default options
- Verify installation:
  ```powershell
  nvcc --version
  ```

### 3. PostgreSQL Development Headers
- PostgreSQL must be installed with development files
- Usually included in standard PostgreSQL installation

### 4. Build Tools
- **Visual Studio 2019 or 2022** (Community Edition is fine)
  - Install "Desktop development with C++" workload
  - Install "Windows 10/11 SDK"
- **CMake** (3.15 or higher)
  - Download from: https://cmake.org/download/
  - Add to PATH during installation

### 5. Git
- For cloning pg_strom repository
- Download from: https://git-scm.com/download/win

## Installation Steps

### Step 1: Install CUDA Toolkit

1. Download CUDA Toolkit 12.x from NVIDIA
2. Run installer (`cuda_12.x.x_windows.exe`)
3. Choose "Express Installation"
4. Verify installation:
   ```powershell
   nvcc --version
   nvidia-smi
   ```
   You should see your RTX 5060 Ti listed.

### Step 2: Install Build Tools

1. Install Visual Studio 2019/2022 with C++ support
2. Install CMake and add to PATH
3. Verify:
   ```powershell
   cmake --version
   ```

### Step 3: Clone and Build pg_strom

**Note:** pg_strom is primarily designed for Linux. On Windows, you have two options:

#### Option A: Use WSL2 (Recommended for Windows)

1. Install WSL2 with Ubuntu:
   ```powershell
   wsl --install -d Ubuntu-22.04
   ```

2. Install PostgreSQL and CUDA in WSL2:
   ```bash
   # In WSL2 Ubuntu terminal
   sudo apt update
   sudo apt install postgresql postgresql-contrib postgresql-server-dev-all
   sudo apt install build-essential cmake
   ```

3. Install CUDA in WSL2 (follow NVIDIA WSL2 CUDA guide)

4. Build pg_strom in WSL2:
   ```bash
   git clone https://github.com/heterodb/pg-strom.git
   cd pg-strom
   make
   sudo make install
   ```

#### Option B: Native Windows Build (Advanced)

pg_strom doesn't officially support Windows, but you can try:

1. Clone repository:
   ```powershell
   git clone https://github.com/heterodb/pg-strom.git
   cd pg-strom
   ```

2. Modify build files for Windows (complex, may require significant changes)

**Recommendation:** Use WSL2 (Option A) for pg_strom on Windows.

### Step 4: Configure PostgreSQL

If using WSL2, configure PostgreSQL in WSL2:

1. Edit `postgresql.conf`:
   ```bash
   # In WSL2
   sudo nano /etc/postgresql/14/main/postgresql.conf
   ```

2. Add/modify:
   ```ini
   shared_preload_libraries = 'pg_strom'
   pg_strom.max_num_devices = 1
   pg_strom.device_ids = 0  # Use first GPU
   ```

3. Restart PostgreSQL:
   ```bash
   sudo systemctl restart postgresql
   ```

### Step 5: Create Extension

Connect to your database and create the extension:

```sql
-- Connect to ems_db
\c ems_db

-- Create extension
CREATE EXTENSION pg_strom;

-- Verify installation
SELECT * FROM pg_strom.device_info;
```

You should see your GPU listed.

## Configuration

### PostgreSQL Settings

Add to `postgresql.conf`:

```ini
# pg_strom Configuration
shared_preload_libraries = 'pg_strom'
pg_strom.max_num_devices = 1
pg_strom.device_ids = 0

# Memory settings (for GPU)
pg_strom.max_dynamic_memory = 2GB  # GPU memory for queries
pg_strom.max_dynamic_memory_per_worker = 512MB

# Enable GPU acceleration
pg_strom.enable_gpuscan = on
pg_strom.enable_gpuhashjoin = on
pg_strom.enable_gpusort = on
pg_strom.enable_gpupreagg = on
```

### Query Hints

pg_strom automatically offloads eligible queries. You can also use hints:

```sql
-- Force GPU scan
SELECT /*+ gpuscan */ * FROM device_12345 WHERE timestamp > '2024-01-01';

-- Force GPU hash join
SELECT /*+ gpuhashjoin */ d.*, e.* 
FROM device_12345 d 
JOIN device_events e ON d.id = e.device_id;
```

## Verification

### Test GPU Acceleration

1. Check GPU is detected:
   ```sql
   SELECT * FROM pg_strom.device_info;
   ```

2. Run a test query:
   ```sql
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT 
     AVG(active_power_total),
     MAX(active_power_total),
     MIN(active_power_total)
   FROM device_12345
   WHERE timestamp > NOW() - INTERVAL '30 days';
   ```

   Look for "GPU Scan" or "GPU PreAgg" in the plan.

3. Monitor GPU usage:
   ```bash
   # In WSL2 or separate terminal
   watch -n 1 nvidia-smi
   ```

## Performance Tuning

### For RTX 5060 Ti (8GB)

```ini
# Optimize for 8GB GPU
pg_strom.max_dynamic_memory = 4GB  # Leave 4GB for system
pg_strom.max_dynamic_memory_per_worker = 1GB
pg_strom.num_workers = 4  # Parallel workers
```

### Query Optimization Tips

1. **Large datasets benefit most:**
   - Queries with >1M rows see significant speedup
   - Small queries may be slower due to GPU overhead

2. **Use appropriate indexes:**
   - pg_strom works best with sequential scans
   - Indexes still help for WHERE clauses

3. **Batch operations:**
   - Multiple aggregations in one query
   - JOINs on large tables

## Troubleshooting

### GPU Not Detected

```sql
-- Check extension status
SELECT * FROM pg_extension WHERE extname = 'pg_strom';

-- Check device info
SELECT * FROM pg_strom.device_info;

-- Check logs
-- In WSL2: /var/log/postgresql/postgresql-14-main.log
```

### Queries Not Using GPU

1. Check query plan:
   ```sql
   EXPLAIN (ANALYZE) YOUR_QUERY;
   ```

2. Verify settings:
   ```sql
   SHOW pg_strom.enable_gpuscan;
   SHOW pg_strom.enable_gpuhashjoin;
   ```

3. Ensure query is eligible:
   - Large enough dataset (>100k rows typically)
   - Appropriate operations (scan, join, aggregate)

### Performance Issues

1. **GPU memory errors:**
   - Reduce `pg_strom.max_dynamic_memory`
   - Reduce `pg_strom.max_dynamic_memory_per_worker`

2. **Slow queries:**
   - GPU overhead for small queries
   - Use `EXPLAIN ANALYZE` to compare CPU vs GPU plans

3. **Driver issues:**
   - Update NVIDIA drivers
   - Verify CUDA compatibility

## Alternative: Use WSL2 PostgreSQL

If native Windows installation is too complex:

1. Install PostgreSQL in WSL2
2. Install pg_strom in WSL2
3. Connect from Windows application:
   ```typescript
   // In backend/.env
   DB_HOST=localhost  # WSL2 exposes to Windows
   DB_PORT=5432
   ```

4. Port forwarding (if needed):
   ```powershell
   # In PowerShell (run as admin)
   netsh interface portproxy add v4tov4 listenport=5432 listenaddress=0.0.0.0 connectport=5432 connectaddress=<WSL2_IP>
   ```

## Monitoring

### Check GPU Usage

```bash
# Real-time monitoring
nvidia-smi -l 1

# Query GPU memory usage
nvidia-smi --query-gpu=memory.used,memory.total --format=csv
```

### PostgreSQL Monitoring

```sql
-- Check pg_strom statistics
SELECT * FROM pg_strom.stats;

-- Check active GPU queries
SELECT * FROM pg_stat_activity WHERE query LIKE '%gpu%';
```

## Performance Expectations

### Typical Speedups (RTX 5060 Ti)

- **Large aggregations (>10M rows):** 20-50x faster
- **JOINs on large tables:** 10-30x faster
- **Complex WHERE clauses:** 5-15x faster
- **Small queries (<100k rows):** May be slower (GPU overhead)

### When to Use GPU

✅ **Use GPU for:**
- Report generation on large date ranges (6+ months)
- Aggregations across millions of rows
- Complex JOINs between large tables
- Real-time analytics on historical data

❌ **Don't use GPU for:**
- Small queries (<100k rows)
- Simple lookups
- Queries that already use indexes efficiently

## Next Steps

1. Install CUDA Toolkit
2. Set up WSL2 (recommended) or attempt native build
3. Build and install pg_strom
4. Configure PostgreSQL
5. Test with your EMS database
6. Monitor performance improvements

## Support

- pg_strom GitHub: https://github.com/heterodb/pg-strom
- Documentation: https://heterodb.github.io/pg-strom/
- Issues: https://github.com/heterodb/pg-strom/issues

## Notes

- pg_strom is primarily designed for Linux
- Windows support requires WSL2 or significant porting effort
- RTX 5060 Ti is well-supported (CUDA 8.6+)
- Works seamlessly with TimescaleDB hypertables

