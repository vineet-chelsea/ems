# Local Setup Troubleshooting

## Common Issue: "Cannot find file specified"

### Problem
Error: `CreateFile C:\Users\vemco\EMS\ems\backend\docker-compose.local.yml: The system cannot find the file specified.`

### Cause
Running `docker-compose` commands from the wrong directory. The `docker-compose.local.yml` file is in the **project root**, not in the `backend` directory.

### Solution

**Always run docker-compose commands from the project root:**

```bash
# Make sure you're in the project root
cd C:\Users\vemco\EMS\ems

# Then run docker-compose
docker-compose -f docker-compose.local.yml up -d
```

### Quick Fix

Use the provided scripts which automatically change to the correct directory:

**Windows:**
```bash
start-local.bat
```

**Linux/Mac:**
```bash
chmod +x start-local.sh
./start-local.sh
```

### Verify You're in the Right Directory

Check that these files exist in your current directory:
- ✅ `docker-compose.local.yml`
- ✅ `docker-compose.yml`
- ✅ `package.json`
- ✅ `backend/` folder

If you see `backend/backend/` or can't find `docker-compose.local.yml`, you're in the wrong directory!

### Manual Check

```powershell
# Windows PowerShell
Get-Location
# Should show: C:\Users\vemco\EMS\ems

# Verify file exists
Test-Path docker-compose.local.yml
# Should return: True
```

## Other Common Issues

### Issue: "No such file: postgresql.local.conf"

**Solution:** Make sure `backend/postgresql.local.conf` exists:
```bash
# From project root
ls backend/postgresql.local.conf
```

### Issue: Docker containers won't start

**Solution:** Check Docker Desktop is running and has enough resources:
1. Open Docker Desktop
2. Settings → Resources → Memory: Set to at least 4GB
3. Settings → Resources → CPUs: Set to at least 2

### Issue: "Out of memory" errors

**Solution:** Use the local configuration which has lower memory requirements:
```bash
docker-compose -f docker-compose.local.yml up -d
```

## Correct Command Structure

Always run from project root:

```bash
# ✅ CORRECT - From project root
cd C:\Users\vemco\EMS\ems
docker-compose -f docker-compose.local.yml up -d

# ❌ WRONG - From backend directory
cd C:\Users\vemco\EMS\ems\backend
docker-compose -f docker-compose.local.yml up -d  # Will fail!
```

## File Locations

```
ems/                          ← Project root (run commands here)
├── docker-compose.local.yml  ← Local config file
├── docker-compose.yml         ← Production config file
├── start-local.bat           ← Windows start script
├── start-local.sh            ← Linux/Mac start script
└── backend/
    ├── postgresql.local.conf  ← Local PostgreSQL config
    └── postgresql.conf        ← Production PostgreSQL config
```

## Still Having Issues?

1. **Verify file locations:**
   ```bash
   # From project root
   dir docker-compose.local.yml
   dir backend\postgresql.local.conf
   ```

2. **Check Docker Desktop:**
   - Is it running?
   - Does it have enough resources allocated?

3. **Try minimal setup:**
   ```bash
   # Start only PostgreSQL and backend (no Kafka)
   docker-compose -f docker-compose.local.yml up -d postgres backend
   ```

4. **Check logs:**
   ```bash
   docker-compose -f docker-compose.local.yml logs
   ```

