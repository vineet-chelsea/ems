# Quick Start Guide - High Performance Setup

## Prerequisites

- Docker Desktop running
- 64GB RAM available
- 20+ CPU cores
- 2x 1TB SSD

## Initial Setup

### 1. Update Environment Variables

Create/update `backend/.env`:

```env
# Database (via pgBouncer for connection pooling)
DB_HOST=pgbouncer
DB_PORT=6432
DB_NAME=ems_db
DB_USER=ems_user
DB_PASSWORD=ems_password

# Kafka
KAFKA_ENABLED=true
KAFKA_BROKERS=kafka:9093

# JWT
JWT_SECRET=your-strong-secret-key-change-this
DEFAULT_ADMIN_PASSWORD=admin123

# Node
NODE_ENV=production
PORT=3001
```

### 2. Start All Services

```bash
# Stop any existing containers
docker-compose down

# Build and start all services
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 3. Verify Services

```bash
# Check PostgreSQL/TimescaleDB
docker exec -it ems_postgres psql -U ems_user -d ems_db -c "SELECT * FROM timescaledb_information.hypertables;"

# Check Kafka
docker exec -it ems_kafka kafka-topics --bootstrap-server localhost:9092 --list

# Check Backend Health
curl http://localhost:3001/health
```

## Architecture Overview

```
┌─────────────┐
│   Devices   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────┐     ┌─────────────┐
│   Backend   │────▶│  Kafka   │────▶│  Database   │
│     API     │     │ (Stream) │     │  Writer     │
└──────┬──────┘     └──────────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│  Frontend   │
└─────────────┘
```

## Performance Features

### TimescaleDB
- **Hypertables**: Automatic time-based partitioning
- **Compression**: 90%+ storage reduction for old data
- **Retention**: Automatic cleanup of old data (90 days default)
- **Indexes**: Optimized for time-series queries

### Kafka
- **Streaming**: Real-time data ingestion
- **Durability**: Data persisted before processing
- **Scalability**: Horizontal scaling support
- **Throughput**: 100K+ messages/second

### Connection Pooling (pgBouncer)
- **Efficiency**: Reduces connection overhead
- **Scalability**: 1000+ concurrent connections
- **Performance**: Faster connection establishment

### PostgreSQL Optimizations
- **WAL**: Write-Ahead Logging for reliability
- **Memory**: 16GB shared buffers, 48GB cache
- **Parallel**: 8 workers per query, 16 total
- **SSD**: Optimized I/O settings

## Monitoring

### Kafka UI
Access at: http://localhost:8081

### Database Stats
```bash
# Connection stats
docker exec -it ems_postgres psql -U ems_user -d ems_db -c "SELECT * FROM pg_stat_activity;"

# Query performance
docker exec -it ems_postgres psql -U ems_user -d ems_db -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Hypertable info
docker exec -it ems_postgres psql -U ems_user -d ems_db -c "SELECT * FROM timescaledb_information.hypertables;"
```

## Expected Performance

- **Write Throughput**: 100,000+ data points/second
- **Query Latency**: <100ms for 1M rows
- **Storage Efficiency**: 90%+ compression after 7 days
- **Concurrent Users**: 1000+ with pgBouncer

## Troubleshooting

### Services Won't Start
```bash
# Check Docker resources
docker stats

# Check logs
docker-compose logs postgres
docker-compose logs kafka
docker-compose logs backend
```

### High Memory Usage
- Check PostgreSQL shared_buffers usage
- Monitor Kafka heap usage
- Review connection counts

### Slow Queries
- Check indexes: `EXPLAIN ANALYZE <query>`
- Review pg_stat_statements
- Check TimescaleDB chunk sizes

## Next Steps

1. Monitor initial performance
2. Tune based on actual workload
3. Set up monitoring dashboards
4. Configure alerts
5. Plan for horizontal scaling if needed

For detailed configuration, see `PERFORMANCE_OPTIMIZATION.md`.

