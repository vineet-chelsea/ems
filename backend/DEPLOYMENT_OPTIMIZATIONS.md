# High-Performance Deployment Optimizations

This document describes the optimizations implemented for high-frequency data collection on high-end hardware.

## Overview

The system has been optimized for:
- **High-frequency sampling** (100ms default, 50ms for critical devices)
- **Batch processing** (10 devices per batch, 100 inserts per batch)
- **TimescaleDB** support for time-series data
- **Worker pool** for concurrent Python script execution
- **Memory management** for large report generation
- **Data retention** (automatic cleanup of data older than 6 months)
- **Performance monitoring** and metrics

## Key Features

### 1. Configurable Performance Settings

All performance parameters can be configured via environment variables or the `performance.config.ts` file:

- **Sampling intervals**: Default 100ms, critical devices 50ms
- **Database pool**: 50 connections (configurable)
- **Batch sizes**: 10 devices, 100 inserts per batch
- **Worker pool**: 10 concurrent workers
- **Memory limits**: 2GB max for reports, spatial sampling threshold 100k rows

### 2. TimescaleDB Integration

- Automatic hypertable conversion for device tables
- Optimized for time-series data with 1-day chunk intervals
- Automatic extension installation on startup

### 3. Batch Insert System

- Queued inserts are batched for better database performance
- Automatic flushing every 50ms or when batch is full
- Reduces database connection overhead

### 4. Worker Pool

- Manages concurrent Python script execution
- Prevents system overload with configurable worker limits
- Queue-based task management

### 5. Device Prioritization

- **Micrologic 6E** devices are collected first (highest priority)
- Critical devices use shorter sampling intervals
- Batch processing ensures efficient resource usage

### 6. Data Retention

- Automatic cleanup of data older than 6 months
- Configurable retention period and schedule
- Runs daily at 2 AM (configurable via cron)

### 7. Memory Management for Reports

- Spatial sampling for large datasets
- Automatic memory estimation and sampling interval calculation
- Prevents memory overload during report generation

### 8. Performance Monitoring

- Real-time metrics logging
- Collection statistics (success rate, average times, queue depth)
- Worker pool statistics
- Configurable logging interval

## Configuration

### Environment Variables

See `ENV_VARIABLES.md` for complete list of configurable variables.

Key variables:
```bash
SAMPLING_INTERVAL=0.1          # 100ms default
CRITICAL_INTERVAL=0.05          # 50ms for Micrologic
BATCH_SIZE=10                   # Devices per batch
INSERT_BATCH_SIZE=100           # Inserts per batch
RETENTION_DAYS=180              # 6 months
MAX_WORKERS=10                  # Worker pool size
MAX_REPORT_MEMORY_MB=2048      # Report memory limit
```

### PostgreSQL Configuration

See `POSTGRESQL_CONFIG.md` for recommended PostgreSQL/TimescaleDB settings.

Key settings:
- `shared_buffers = 16GB` (25% of 64GB RAM)
- `effective_cache_size = 48GB` (75% of RAM)
- `random_page_cost = 1.1` (SSD optimized)
- `effective_io_concurrency = 200` (SSD optimized)

## Deployment Steps

1. **Install TimescaleDB Extension**
   ```sql
   CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
   ```

2. **Configure PostgreSQL**
   - Edit `postgresql.conf` with settings from `POSTGRESQL_CONFIG.md`
   - Restart PostgreSQL service

3. **Set Environment Variables**
   - Copy `.env.example` to `.env` (or create `.env`)
   - Adjust values for your deployment

4. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

5. **Build and Start**
   ```bash
   npm run build
   npm start
   ```

## Monitoring

### Metrics

Metrics are logged every 60 seconds (configurable) and include:
- Total collections, success/failure counts
- Average collection time
- Average database insert time
- Queue depth
- Devices per second
- Worker pool statistics

### Database Monitoring

```sql
-- Check hypertable status
SELECT * FROM timescaledb_information.hypertables;

-- Monitor connection pool
SELECT count(*) FROM pg_stat_activity;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'device_%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Performance Tuning

### For Higher Throughput

- Increase `BATCH_SIZE` (if you have more devices)
- Increase `INSERT_BATCH_SIZE` (if inserts are slow)
- Increase `DB_POOL_SIZE` (if connection pool is exhausted)
- Increase `MAX_WORKERS` (if Python scripts are queuing)

### For Lower Latency

- Decrease `SAMPLING_INTERVAL` (faster collection)
- Decrease `CRITICAL_INTERVAL` (faster critical device collection)
- Decrease `INSERT_BATCH_SIZE` (faster data availability)

### For Memory Constraints

- Decrease `MAX_REPORT_MEMORY_MB`
- Decrease `SPATIAL_SAMPLING_THRESHOLD`
- Decrease `DB_POOL_SIZE`

## Troubleshooting

### High Queue Depth

If `queueDepth` is consistently high:
- Increase `INSERT_BATCH_SIZE`
- Increase `DB_POOL_SIZE`
- Check database performance

### Slow Collections

If collection times are high:
- Check network latency to devices
- Increase `MAX_WORKERS`
- Check Python script execution time
- Monitor database query performance

### Memory Issues

If memory usage is high:
- Reduce `MAX_REPORT_MEMORY_MB`
- Reduce `SPATIAL_SAMPLING_THRESHOLD`
- Check for memory leaks in long-running processes

## Notes

- All optimizations are backward compatible
- System gracefully degrades if TimescaleDB is not available
- Configuration can be adjusted post-deployment via environment variables
- Metrics are logged but not persisted (consider adding metrics storage for long-term monitoring)

