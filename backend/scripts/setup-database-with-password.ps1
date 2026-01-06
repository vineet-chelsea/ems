# PowerShell script to setup PostgreSQL database for EMS
# This version prompts for the postgres password

Write-Host "PostgreSQL Database Setup for EMS" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if psql is available
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "ERROR: psql command not found." -ForegroundColor Red
    Write-Host "Please add PostgreSQL bin directory to your PATH or use full path." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Common PostgreSQL installation paths:" -ForegroundColor Yellow
    $commonPaths = @(
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files\PostgreSQL\14\bin\psql.exe",
        "C:\Program Files\PostgreSQL\13\bin\psql.exe"
    )
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            Write-Host "  Found: $path" -ForegroundColor Green
            $psqlPath = Get-Command $path
            break
        }
    }
    
    if (-not $psqlPath) {
        Write-Host "  Please locate your PostgreSQL installation and add it to PATH" -ForegroundColor Gray
        exit 1
    }
}

Write-Host "Using psql at: $($psqlPath.Source)" -ForegroundColor Green
Write-Host ""

# Prompt for postgres password
Write-Host "Enter PostgreSQL 'postgres' user password:" -ForegroundColor Yellow
$securePassword = Read-Host -AsSecureString
$postgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

if (-not $postgresPassword) {
    Write-Host "No password provided. Trying without password..." -ForegroundColor Yellow
}

# Set password environment variable
if ($postgresPassword) {
    $env:PGPASSWORD = $postgresPassword
}

Write-Host ""
Write-Host "Setting up database and user..." -ForegroundColor Yellow
Write-Host ""

try {
    # Test connection first
    Write-Host "Testing connection to PostgreSQL..." -ForegroundColor Cyan
    $testResult = psql -U postgres -c "SELECT version();" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Cannot connect to PostgreSQL" -ForegroundColor Red
        Write-Host $testResult -ForegroundColor Red
        Write-Host ""
        Write-Host "Possible issues:" -ForegroundColor Yellow
        Write-Host "  1. Wrong password" -ForegroundColor Gray
        Write-Host "  2. PostgreSQL service not running" -ForegroundColor Gray
        Write-Host "  3. PostgreSQL not installed" -ForegroundColor Gray
        exit 1
    }
    Write-Host "  ✓ Connected successfully" -ForegroundColor Green
    Write-Host ""

    # Create database
    Write-Host "Creating database 'ems_db'..." -ForegroundColor Cyan
    $createDbResult = psql -U postgres -c "CREATE DATABASE ems_db;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Database created" -ForegroundColor Green
    } else {
        if ($createDbResult -match "already exists") {
            Write-Host "  ⚠ Database already exists (this is OK)" -ForegroundColor Yellow
        } else {
            Write-Host "  ⚠ $createDbResult" -ForegroundColor Yellow
        }
    }

    # Create user
    Write-Host "Creating user 'ems_user'..." -ForegroundColor Cyan
    $createUserSQL = @"
DO `$`$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ems_user') THEN
        CREATE USER ems_user WITH PASSWORD 'ems_password';
        RAISE NOTICE 'User ems_user created';
    ELSE
        ALTER USER ems_user WITH PASSWORD 'ems_password';
        RAISE NOTICE 'User ems_user password updated';
    END IF;
END
`$`$;
"@
    $createUserResult = $createUserSQL | psql -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ User created/updated" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ User creation result: $createUserResult" -ForegroundColor Yellow
    }

    # Grant database privileges
    Write-Host "Granting database privileges..." -ForegroundColor Cyan
    $grantDbResult = psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE ems_db TO ems_user;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Database privileges granted" -ForegroundColor Green
    }

    # Grant schema privileges
    Write-Host "Granting schema privileges..." -ForegroundColor Cyan
    $grantSchemaSQL = @"
GRANT ALL ON SCHEMA public TO ems_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ems_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ems_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ems_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ems_user;
"@
    $grantSchemaResult = $grantSchemaSQL | psql -U postgres -d ems_db 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Schema privileges granted" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Setup complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Database configuration:" -ForegroundColor Cyan
    Write-Host "  Database: ems_db" -ForegroundColor White
    Write-Host "  User: ems_user" -ForegroundColor White
    Write-Host "  Password: ems_password" -ForegroundColor White
    Write-Host ""
    Write-Host "You can now start the backend with: npm run dev" -ForegroundColor Green

} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to setup database" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual setup instructions:" -ForegroundColor Yellow
    Write-Host "1. Connect: psql -U postgres" -ForegroundColor Gray
    Write-Host "2. Run SQL from: scripts/setup-database.sql" -ForegroundColor Gray
    exit 1
} finally {
    # Clear password from environment
    $env:PGPASSWORD = $null
    # Clear password from memory
    $postgresPassword = $null
    $securePassword = $null
}

