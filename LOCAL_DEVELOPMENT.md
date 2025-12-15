# Local Development Setup Guide

## ⚠️ Important: Local vs Production

The high-performance configuration (`docker-compose.yml`) is optimized for:
- **64GB RAM**
- **20 CPU cores**
- **Production server**

**This will NOT work on most local machines!**

## Solution: Use Local Configuration

For local development/testing, use the scaled-down configuration:

### Quick Start (Local)

```bash
# Use the local docker-compose file
docker-compose -f docker-compose.local.yml up -d

# Check status
docker-compose -f docker-compose.local.yml ps

# View logs
docker-compose -f docker-compose.local.yml logs -f
```

### Local Configuration Differences

| Component | Production | Local |
|-----------|-----------|-------|
| **PostgreSQL Memory** | 48GB limit | No limit (uses system) |
| **shared_buffers** | 16GB | 2GB |
| **effective_cache_size** | 48GB | 6GB |
| **Kafka Memory** | 8GB | 512MB heap |
| **Kafka Partitions** | 10 | 3 |
| **pgBouncer Connections** | 1000 | 100 |
| **Parallel Workers** | 16 | 4 |

### Local System Requirements

**Minimum:**
- 8GB RAM
- 4 CPU cores
- 20GB free disk space

**Recommended:**
- 16GB RAM
- 8 CPU cores
- 50GB free disk space

## Switching Between Configurations

### For Local Development:
```bash
docker-compose -f docker-compose.local.yml up -d
```

### For Production/High-Performance:
```bash
docker-compose up -d
```

## Potential Issues on Local

### 1. Out of Memory Errors

**Symptoms:**
- Containers crash or won't start
- "Cannot allocate memory" errors
- System becomes slow/unresponsive

**Solution:**
- Use `docker-compose.local.yml` instead
- Close other applications
- Increase Docker Desktop memory limit (Settings → Resources → Memory)

### 2. PostgreSQL Won't Start

**Symptoms:**
- PostgreSQL container exits immediately
- Errors about shared_buffers being too large

**Solution:**
- The local config uses 2GB instead of 16GB
- If still failing, reduce further in `postgresql.local.conf`:
  ```conf
  shared_buffers = 1GB
  effective_cache_size = 3GB
  ```

### 3. Kafka Slow/Unresponsive

**Symptoms:**
- Kafka takes long to start
- High CPU usage
- Messages not processing

**Solution:**
- Local config limits Kafka to 512MB heap
- Reduce partitions if needed (change `KAFKA_NUM_PARTITIONS: 3` to `1`)

### 4. Too Many Services

**Symptoms:**
- System running out of resources
- Slow performance

**Solution - Disable Optional Services:**

Create `docker-compose.local-minimal.yml`:

```yaml
services:
  postgres:
    # ... (keep postgres)
  
  backend:
    # ... (keep backend)
    environment:
      KAFKA_ENABLED: "false"  # Disable Kafka for minimal setup
```

Or disable Kafka UI:
```bash
docker-compose -f docker-compose.local.yml up -d postgres pgbouncer backend
```

## Performance Expectations (Local)

With local configuration:
- **Write Throughput**: 1,000-10,000 data points/second
- **Query Latency**: <500ms for 100K rows
- **Concurrent Users**: 10-50

This is sufficient for development and testing!

## Testing Without Kafka

If Kafka is causing issues, you can disable it:

1. Set environment variable:
   ```env
   KAFKA_ENABLED=false
   ```

2. Or don't start Kafka services:
   ```bash
   docker-compose -f docker-compose.local.yml up -d postgres pgbouncer backend
   ```

The system will work without Kafka - data will go directly to the database.

## Monitoring Local Resources

```bash
# Check Docker resource usage
docker stats

# Check system memory
# Windows: Task Manager → Performance
# Mac: Activity Monitor
# Linux: free -h

# Check disk space
docker system df
```

## Recommended Local Setup

For best local development experience:

1. **Use local config**: `docker-compose.local.yml`
2. **Disable Kafka UI** (optional): Comment out in docker-compose file
3. **Limit Docker resources**: Set Docker Desktop to use max 8GB RAM
4. **Close other apps**: Free up system resources

## Troubleshooting

### Containers won't start
```bash
# Check Docker Desktop is running
# Check available resources
docker system df
docker stats

# Try starting one service at a time
docker-compose -f docker-compose.local.yml up -d postgres
# Wait for it to be healthy, then:
docker-compose -f docker-compose.local.yml up -d
```

### PostgreSQL errors about memory
- Edit `backend/postgresql.local.conf`
- Reduce `shared_buffers` to 1GB or 512MB
- Reduce `effective_cache_size` proportionally

### Out of disk space
```bash
# Clean up Docker
docker system prune -a --volumes

# Remove old containers
docker-compose -f docker-compose.local.yml down -v
```

## Quick Commands

```bash
# Start local setup
docker-compose -f docker-compose.local.yml up -d

# Stop local setup
docker-compose -f docker-compose.local.yml down

# View logs
docker-compose -f docker-compose.local.yml logs -f backend

# Rebuild after changes
docker-compose -f docker-compose.local.yml up -d --build

# Clean start (removes volumes)
docker-compose -f docker-compose.local.yml down -v
docker-compose -f docker-compose.local.yml up -d
```

## Summary

✅ **For Local Development**: Use `docker-compose.local.yml`  
✅ **For Production**: Use `docker-compose.yml`  
✅ **Local config is automatically scaled down**  
✅ **All features work, just with lower limits**

The local configuration maintains all functionality (TimescaleDB, Kafka, etc.) but with resource limits suitable for typical development machines.

