# Performance Optimization Guide

## System Specifications
- **RAM**: 64GB
- **CPU**: 20 cores
- **GPU**: 8GB RTX 5060
- **Storage**: 2x 1TB SSD

## Architecture Overview

### Components

1. **TimescaleDB** - PostgreSQL extension optimized for time-series data
   - Automatic partitioning (chunking) by time
   - Compression for older data
   - Retention policies for automatic cleanup
   - Optimized indexes for time-series queries

2. **Kafka** - Message streaming platform
   - Real-time data ingestion
   - Decouples data producers from consumers
   - Enables horizontal scaling
   - Provides data durability

3. **pgBouncer** - Connection pooler
   - Reduces connection overhead
   - Improves connection management
   - Supports up to 1000 client connections

4. **PostgreSQL Optimizations**
   - WAL (Write-Ahead Logging) for reliability
   - Optimized for SSD storage
   - Parallel query processing
   - Memory tuning for 64GB RAM

## Configuration Details

### PostgreSQL/TimescaleDB

**Memory Settings:**
- `shared_buffers`: 16GB (25% of RAM)
- `effective_cache_size`: 48GB (75% of RAM)
- `work_mem`: 256MB per operation
- `maintenance_work_mem`: 2GB

**WAL Settings:**
- `wal_level`: replica (for reliability)
- `wal_buffers`: 64MB
- `min_wal_size`: 4GB
- `max_wal_size`: 16GB
- `wal_compression`: on

**Parallel Processing:**
- `max_parallel_workers_per_gather`: 8
- `max_parallel_workers`: 16
- `max_parallel_maintenance_workers`: 8

**SSD Optimization:**
- `random_page_cost`: 1.1 (lower than HDD default)
- `effective_io_concurrency`: 200

### TimescaleDB Features

**Hypertables:**
- Automatic partitioning by time (1-day chunks)
- Optimized for time-series queries
- Automatic chunk management

**Compression:**
- Enabled for data older than 7 days
- Reduces storage by 90%+
- Maintains query performance

**Retention Policies:**
- Automatic data cleanup
- Configurable retention period (default: 90 days)
- Per-device configuration

### Kafka Configuration

**Topics:**
- `device-data-{deviceId}` - Per-device topics
- 10 partitions per topic
- Snappy compression

**Performance:**
- 8 network threads
- 16 I/O threads
- 1GB log segments
- 7-day retention

### Connection Pooling (pgBouncer)

**Settings:**
- Pool mode: Transaction
- Max client connections: 1000
- Default pool size: 50
- Reserve pool: 10

## Data Flow

1. **Data Ingestion:**
   ```
   Device → Backend API → Kafka → Database Writer
   ```

2. **Real-time Processing:**
   - Kafka consumers process messages asynchronously
   - Batch inserts for better performance
   - Non-blocking writes

3. **Query Performance:**
   - TimescaleDB hypertables optimize time-range queries
   - Indexes on timestamp and common fields
   - Compression doesn't affect query speed

## Performance Metrics

### Expected Performance

**Write Throughput:**
- Up to 100,000 data points/second (with Kafka)
- Batch inserts: 10,000-50,000 rows/second
- Single inserts: 1,000-5,000 rows/second

**Query Performance:**
- Time-range queries: <100ms for 1M rows
- Latest data: <10ms
- Aggregations: <500ms for 1M rows

**Storage:**
- Raw data: ~500 bytes per data point
- Compressed (7+ days): ~50 bytes per data point
- 1TB can store ~2 billion uncompressed points
- 1TB can store ~20 billion compressed points

## Monitoring

### Key Metrics to Monitor

1. **Database:**
   - Connection pool usage
   - Query performance (pg_stat_statements)
   - WAL size and checkpoint frequency
   - Cache hit ratio

2. **Kafka:**
   - Message lag
   - Throughput (messages/second)
   - Consumer lag
   - Topic sizes

3. **System:**
   - CPU usage (should utilize all cores)
   - Memory usage (PostgreSQL should use allocated memory)
   - Disk I/O (SSD should handle high throughput)
   - Network throughput

## Tuning Recommendations

### For Higher Write Throughput

1. Increase Kafka partitions (currently 10)
2. Add more Kafka consumers
3. Increase batch sizes
4. Tune WAL settings for higher write load

### For Higher Query Performance

1. Add more indexes on frequently queried fields
2. Increase `work_mem` for complex queries
3. Use materialized views for common aggregations
4. Enable query result caching

### For Storage Optimization

1. Adjust compression policy (earlier compression)
2. Reduce retention period if needed
3. Use TimescaleDB continuous aggregates
4. Archive old data to cold storage

## Backup and Recovery

### WAL-based Backup

PostgreSQL WAL enables:
- Point-in-time recovery
- Continuous archiving
- Hot backups (no downtime)

### Recommended Backup Strategy

1. **Daily Full Backups:**
   - Use `pg_dump` or `pg_basebackup`
   - Store on second SSD or external storage

2. **WAL Archiving:**
   - Archive WAL files continuously
   - Keep 7-30 days of WAL archives

3. **TimescaleDB Backups:**
   - Use `timescaledb-backup` for hypertables
   - Backup compressed chunks separately

## Scaling

### Horizontal Scaling

1. **Read Replicas:**
   - Add PostgreSQL read replicas
   - Route read queries to replicas
   - Use pgBouncer for load balancing

2. **Kafka Consumers:**
   - Add more consumer instances
   - Scale horizontally based on load

3. **Backend API:**
   - Multiple backend instances
   - Load balancer in front

### Vertical Scaling

Current configuration uses:
- 48GB RAM for PostgreSQL (can increase to 56GB)
- 8 cores for parallel processing (can use all 20)
- 4GB for Kafka (can increase to 8GB)

## Maintenance

### Regular Tasks

1. **Weekly:**
   - Check disk space usage
   - Review slow query log
   - Monitor Kafka lag

2. **Monthly:**
   - Analyze table statistics
   - Review retention policies
   - Check compression effectiveness

3. **Quarterly:**
   - Review and tune configuration
   - Analyze query patterns
   - Optimize indexes

## Troubleshooting

### High Memory Usage

- Check `shared_buffers` usage
- Review connection count
- Check for memory leaks in queries

### Slow Queries

- Use `EXPLAIN ANALYZE` to identify bottlenecks
- Check index usage
- Review `pg_stat_statements`

### Kafka Lag

- Increase consumer instances
- Check consumer processing speed
- Review Kafka broker performance

### Disk Space

- Check retention policies
- Review compression effectiveness
- Consider archiving old data

## Environment Variables

Add to `backend/.env`:

```env
# Database (via pgBouncer)
DB_HOST=pgbouncer
DB_PORT=6432

# Kafka
KAFKA_ENABLED=true
KAFKA_BROKERS=kafka:9093

# Performance
NODE_ENV=production
```

## Next Steps

1. Start services: `docker-compose up -d`
2. Monitor initial performance
3. Tune based on actual workload
4. Set up monitoring dashboards
5. Configure alerts for critical metrics

