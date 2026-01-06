# Environment Variables Configuration

This document describes all configurable environment variables for the EMS backend.

## Database Configuration

```bash
DB_HOST=localhost              # PostgreSQL host
DB_PORT=5432                   # PostgreSQL port
DB_NAME=ems_db                 # Database name
DB_USER=ems_user               # Database user
DB_PASSWORD=ems_password       # Database password
```

## Sampling Intervals (in seconds)

```bash
SAMPLING_INTERVAL=0.1          # Default sampling interval (100ms)
CRITICAL_INTERVAL=0.05         # Micrologic 6E interval (50ms)
NORMAL_INTERVAL=0.2            # Other devices interval (200ms)
```

## Database Pool Configuration

```bash
DB_POOL_SIZE=50                # Maximum connection pool size
DB_MIN_CONNECTIONS=10          # Minimum connections to maintain
```

## Batch Processing

```bash
BATCH_SIZE=10                  # Number of devices per batch
INSERT_BATCH_SIZE=100          # Number of inserts per batch
```

## Data Retention

```bash
RETENTION_DAYS=180             # Delete data older than this (6 months)
CLEANUP_SCHEDULE=0 2 * * *     # Cron expression (daily at 2 AM)
```

## Worker Pool

```bash
MAX_WORKERS=10                 # Maximum concurrent Python script workers
WORKER_TIMEOUT=5000            # Worker timeout in milliseconds
```

## Memory Management

```bash
MAX_REPORT_MEMORY_MB=2048      # Maximum memory for reports (2GB)
SPATIAL_SAMPLING_THRESHOLD=100000  # Use spatial sampling if rows > this
```

## Monitoring

```bash
MONITORING_ENABLED=true        # Enable metrics logging
MONITORING_LOG_INTERVAL=60     # Log metrics every N seconds
```

## Server

```bash
PORT=3001                      # Backend server port
```

## Kafka (Optional)

```bash
KAFKA_ENABLED=false            # Enable Kafka integration
KAFKA_BROKERS=localhost:9092   # Kafka broker addresses
```

## Usage

1. Copy `.env.example` to `.env` (if it exists) or create `.env` file
2. Set the variables according to your deployment requirements
3. Restart the backend service for changes to take effect

## Notes

- All intervals are in seconds (e.g., 0.1 = 100ms)
- Cron schedule uses standard cron syntax (minute hour day month weekday)
- Memory settings are in megabytes
- Timeout values are in milliseconds

