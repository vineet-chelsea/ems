# PostgreSQL/TimescaleDB Configuration Recommendations

This document provides recommended PostgreSQL configuration settings for high-performance data collection with 64GB RAM, SSD storage, and 10-core processor.

## Installation

### TimescaleDB Extension
```sql
-- Install TimescaleDB extension (run as superuser)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
```

## Configuration File: `postgresql.conf`

Add or modify these settings in your PostgreSQL configuration file:

```ini
# ============================================
# Memory Settings (64GB RAM)
# ============================================
shared_buffers = 16GB                    # 25% of RAM
effective_cache_size = 48GB              # 75% of RAM
work_mem = 256MB                         # Per operation
maintenance_work_mem = 2GB               # For VACUUM, etc.

# ============================================
# WAL Settings (SSD optimized)
# ============================================
wal_buffers = 16MB
max_wal_size = 8GB                       # Large WAL for high write throughput
min_wal_size = 2GB
checkpoint_completion_target = 0.9       # Spread checkpoints
checkpoint_timeout = 15min

# ============================================
# Connection Settings
# ============================================
max_connections = 200
max_worker_processes = 20                # Match CPU threads
max_parallel_workers_per_gather = 10
max_parallel_workers = 20

# ============================================
# Query Planner (SSD optimized)
# ============================================
random_page_cost = 1.1                   # Lower for SSD (default is 4.0)
effective_io_concurrency = 200           # Higher for SSD (default is 1)

# ============================================
# TimescaleDB Specific
# ============================================
timescaledb.max_background_workers = 8

# ============================================
# Performance Tuning
# ============================================
synchronous_commit = on                  # Data safety (can be 'off' for speed)
commit_delay = 0                         # No delay
commit_siblings = 5
default_statistics_target = 100
```

## Windows-Specific Notes

### Finding postgresql.conf
- Default location: `C:\Program Files\PostgreSQL\<version>\data\postgresql.conf`
- Or check: `SHOW config_file;` in psql

### Applying Changes
1. Edit `postgresql.conf` with the above settings
2. Restart PostgreSQL service:
   ```powershell
   Restart-Service postgresql-x64-<version>
   ```

### Verification
```sql
-- Check current settings
SHOW shared_buffers;
SHOW effective_cache_size;
SHOW max_connections;
SHOW random_page_cost;
SHOW effective_io_concurrency;

-- Check TimescaleDB
SELECT * FROM pg_extension WHERE extname = 'timescaledb';
```

## Performance Monitoring

### Check hypertable status
```sql
SELECT * FROM timescaledb_information.hypertables;
```

### Monitor query performance
```sql
-- Enable query logging (optional, for debugging)
SET log_min_duration_statement = 1000;  -- Log queries > 1 second
```

### Check connection pool usage
```sql
SELECT count(*) FROM pg_stat_activity;
```

## Additional Optimizations

### Index Maintenance
```sql
-- Analyze tables regularly (automatic with autovacuum, but can run manually)
ANALYZE;

-- Reindex if needed
REINDEX DATABASE ems_db;
```

### Vacuum Settings (already optimized via autovacuum)
```ini
autovacuum = on
autovacuum_max_workers = 4
autovacuum_naptime = 10s
```

## Notes

- **shared_buffers**: 25% of RAM is a good starting point for dedicated database servers
- **effective_cache_size**: Should be set to total RAM minus shared_buffers
- **random_page_cost**: Lower value (1.1) tells planner that random I/O is cheap (SSD)
- **effective_io_concurrency**: Higher value allows more concurrent I/O operations (SSD)
- **TimescaleDB**: Automatically manages chunking and compression for time-series data

## Troubleshooting

If you encounter memory issues:
- Reduce `shared_buffers` to 8GB
- Reduce `work_mem` to 128MB
- Reduce `max_connections` to 100

If you encounter slow writes:
- Increase `max_wal_size` to 16GB
- Set `synchronous_commit = off` (trade-off: risk of data loss on crash)

